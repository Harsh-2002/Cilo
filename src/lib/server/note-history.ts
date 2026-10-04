import { randomUUID } from "node:crypto";
import { sqlite } from "./db";
import { getNote } from "./notes";
import { HttpError } from "./http";
import { plainText } from "./validation";
import { syncNoteLinks } from "./connections";
import type { Note, NoteVersion } from "../types";
export function checkpoint(note: Note, force = false) {
  const database = sqlite();
  const latest = database
    .prepare(
      "SELECT created_at AS createdAt,title,document FROM note_versions WHERE note_id=? ORDER BY rowid DESC LIMIT 1",
    )
    .get(note.id) as
    { createdAt: number; title: string; document: string } | undefined;
  const document = JSON.stringify(note.document);
  if (latest?.title === note.title && latest.document === document) return;
  if (!force && latest && Date.now() - latest.createdAt < 300000) return;
  database
    .prepare(
      "INSERT INTO note_versions(id,note_id,title,document,revision,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      note.id,
      note.title,
      document,
      note.revision,
      Date.now(),
    );
  database
    .prepare(
      "DELETE FROM note_versions WHERE note_id=? AND id NOT IN (SELECT id FROM note_versions WHERE note_id=? ORDER BY rowid DESC LIMIT 100)",
    )
    .run(note.id, note.id);
}
export function listVersions(id: string): NoteVersion[] {
  return sqlite()
    .prepare(
      "SELECT id,title,revision,created_at AS createdAt FROM note_versions WHERE note_id=? ORDER BY rowid DESC",
    )
    .all(id) as NoteVersion[];
}
export function getVersion(note: string, id: string): NoteVersion {
  const row = sqlite()
    .prepare(
      "SELECT id,title,document,revision,created_at AS createdAt FROM note_versions WHERE note_id=? AND id=?",
    )
    .get(note, id) as
    (Omit<NoteVersion, "document"> & { document: string }) | undefined;
  if (!row) throw new HttpError(404, "This version is no longer available.");
  return { ...row, document: JSON.parse(row.document) };
}
export function restoreVersion(
  note: string,
  id: string,
  revision: number,
): Note {
  const database = sqlite();
  return database
    .transaction(() => {
      const previous = getNote(note);
      if (!previous) throw new HttpError(404, "This note was not found.");
      if (previous.trashedAt)
        throw new HttpError(400, "Restore this note from trash first.");
      if (previous.revision !== revision)
        throw new HttpError(
          409,
          "This note changed. Reload it before restoring a version.",
        );
      const version = getVersion(note, id);
      checkpoint(previous, true);
      database
        .prepare(
          "UPDATE notes SET title=?,document=?,text=?,revision=revision+1,updated_at=? WHERE id=?",
        )
        .run(
          version.title,
          JSON.stringify(version.document),
          plainText(version.document!.blocks),
          Date.now(),
          note,
        );
      syncNoteLinks(note, version.document!);
      return getNote(note)!;
    })
    .immediate();
}
