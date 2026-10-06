import { randomUUID } from "node:crypto";
import { db, sqlite } from "./db";
import { notes } from "./schema";
import { eq } from "drizzle-orm";
import { emptyDocument, type Note, type NoteSummary, type Tag } from "../types";
import { fuzzyQuery } from "./search";
import { plainText, ftsQuery } from "./validation";
import { syncNoteLinks } from "./connections";

const columns =
  "n.id,n.title,n.revision,n.favorite,n.editor_width AS editorWidth,n.kind,n.daily_date AS dailyDate,n.trashed_at AS trashedAt,n.created_at AS createdAt,n.updated_at AS updatedAt";
export function tagsFor(note: string): Tag[] {
  return sqlite()
    .prepare(
      "SELECT t.id,t.name,t.color FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=? ORDER BY t.name",
    )
    .all(note) as Tag[];
}
export function getNote(id: string): Note | undefined {
  const row = db().select().from(notes).where(eq(notes.id, id)).get();
  return row ? { ...row, tags: tagsFor(id) } : undefined;
}
export function listNotes(
  params: URLSearchParams,
  queryOverride?: string,
): NoteSummary[] {
  const view = params.get("view");
  const where = [
    view === "trash" ? "1=1" : "n.kind='note'",
    view === "trash" ? "n.trashed_at IS NOT NULL" : "n.trashed_at IS NULL",
  ];
  // Journal entries live in their own section, so Notes lists only undated notes.
  if (view === "journal") where.push("n.daily_date IS NOT NULL");
  else if (view === "all" && !params.get("tag"))
    where.push("n.daily_date IS NULL");
  const values: (string | number)[] = [];
  const search = queryOverride ?? ftsQuery(params.get("q") || "");
  if (search) {
    where.push("notes_fts MATCH ?");
    values.push(search);
  }
  if (view === "favorites") where.push("n.favorite=1");
  if (params.get("tag")) {
    where.push(
      "EXISTS (SELECT 1 FROM note_tags WHERE note_id=n.id AND tag_id=?)",
    );
    values.push(params.get("tag")!);
  }
  const order = search
    ? "notes_fts.rank"
    : view === "journal"
      ? "n.daily_date DESC"
      : params.get("sort") === "title"
        ? "n.title COLLATE NOCASE"
        : params.get("sort") === "created"
          ? "n.created_at DESC"
          : "n.updated_at DESC";
  const source = search
    ? "notes n JOIN notes_fts ON notes_fts.rowid=n.rowid"
    : "notes n";
  const bounded = params.has("limit");
  const limit = Math.max(
    1,
    Math.min(100, Math.trunc(Number(params.get("limit"))) || 30),
  );
  const offset = Math.max(
    0,
    Math.min(1000000, Math.trunc(Number(params.get("offset"))) || 0),
  );
  const text =
    params.get("preview") === "1"
      ? "substr(replace(n.text,char(10),' '),1,180)"
      : "n.text";
  const rows = sqlite()
    .prepare(
      `SELECT ${columns},${text} AS text FROM ${source} WHERE ${where.join(" AND ")} ORDER BY ${order},n.id${bounded ? " LIMIT ? OFFSET ?" : ""}`,
    )
    .all(...values, ...(bounded ? [limit, offset] : [])) as NoteSummary[];
  if (
    !rows.length &&
    search &&
    queryOverride === undefined &&
    (!offset ||
      !sqlite()
        .prepare(`SELECT 1 FROM ${source} WHERE ${where.join(" AND ")} LIMIT 1`)
        .get(...values))
  ) {
    const fallback = fuzzyQuery(params.get("q") || "");
    if (fallback) return listNotes(params, fallback);
  }
  const tags = new Map<string, Tag[]>();
  for (let start = 0; start < rows.length; start += 500) {
    const ids = rows.slice(start, start + 500).map((row) => row.id);
    const linked = sqlite()
      .prepare(
        `SELECT nt.note_id AS noteId,t.id,t.name,t.color FROM note_tags nt JOIN tags t ON t.id=nt.tag_id WHERE nt.note_id IN (${ids.map(() => "?").join(",")}) ORDER BY t.name`,
      )
      .all(...ids) as (Tag & { noteId: string })[];
    for (const { noteId, ...tag } of linked)
      tags.set(noteId, [...(tags.get(noteId) || []), tag]);
  }
  return rows.map((n) => ({
    ...n,
    favorite: Boolean(n.favorite),
    tags: tags.get(n.id) || [],
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
  syncNoteLinks(id, document);
  return getNote(id)!;
}
