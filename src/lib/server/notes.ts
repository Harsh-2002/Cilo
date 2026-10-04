import { randomUUID } from "node:crypto";
import { db, sqlite } from "./db";
import { notes } from "./schema";
import { eq } from "drizzle-orm";
import { emptyDocument, type Note, type NoteSummary, type Tag } from "../types";
import { plainText, ftsQuery } from "./validation";

const columns =
  "n.id,n.title,n.text,n.revision,n.favorite,n.trashed_at AS trashedAt,n.created_at AS createdAt,n.updated_at AS updatedAt";
export function tagsFor(note: string): Tag[] {
  return sqlite()
    .prepare(
      "SELECT t.id,t.name FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=? ORDER BY t.name",
    )
    .all(note) as Tag[];
}
export function getNote(id: string): Note | undefined {
  const row = db().select().from(notes).where(eq(notes.id, id)).get();
  return row ? { ...row, tags: tagsFor(id) } : undefined;
}
export function listNotes(params: URLSearchParams): NoteSummary[] {
  const where = [
    params.get("view") === "trash"
      ? "n.trashed_at IS NOT NULL"
      : "n.trashed_at IS NULL",
  ];
  const values: string[] = [];
  const search = ftsQuery(params.get("q") || "");
  if (search) {
    where.push(
      "n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)",
    );
    values.push(search);
  }
  if (params.get("view") === "favorites") where.push("n.favorite=1");
  if (params.get("tag")) {
    where.push(
      "EXISTS (SELECT 1 FROM note_tags WHERE note_id=n.id AND tag_id=?)",
    );
    values.push(params.get("tag")!);
  }
  const order = search
    ? "(SELECT rank FROM notes_fts WHERE rowid=n.rowid AND notes_fts MATCH ?)"
    : params.get("sort") === "title"
      ? "n.title COLLATE NOCASE"
      : params.get("sort") === "created"
        ? "n.created_at DESC"
        : "n.updated_at DESC";
  if (search) values.push(search);
  const rows = sqlite()
    .prepare(
      `SELECT ${columns} FROM notes n WHERE ${where.join(" AND ")} ORDER BY ${order}`,
    )
    .all(...values) as NoteSummary[];
  return rows.map((n) => ({
    ...n,
    favorite: Boolean(n.favorite),
    tags: tagsFor(n.id),
  }));
}
export function createNote(
  owner: string,
  title = "",
  document = emptyDocument,
): Note {
  const id = randomUUID();
  const now = Date.now();
  db()
    .insert(notes)
    .values({
      id,
      ownerId: owner,
      title,
      document,
      text: plainText(document.blocks),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getNote(id)!;
}
