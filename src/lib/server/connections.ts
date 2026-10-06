import { sqlite } from "./db";
import { HttpError } from "./http";
import type { Connections, Document } from "../types";
export function linkedNoteIds(document: Document): string[] {
  const result = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.href === "string") {
      const match = item.href.match(/^\/\?note=([a-f0-9-]{36})$/);
      if (match) result.add(match[1]);
    }
    Object.values(item).forEach(visit);
  };
  visit(document.blocks);
  return [...result];
}
export function syncNoteLinks(id: string, document: Document) {
  const database = sqlite();
  database.prepare("DELETE FROM note_links WHERE source_id=?").run(id);
  const insert = database.prepare(
    "INSERT OR IGNORE INTO note_links SELECT ?,id FROM notes WHERE id=? AND id<>?",
  );
  for (const target of linkedNoteIds(document)) insert.run(id, target, id);
}
export function requireLinkedNote(
  owner: string,
  id: string | null | undefined,
) {
  if (
    id &&
    !sqlite()
      .prepare(
        "SELECT 1 FROM notes WHERE id=? AND owner_id=? AND trashed_at IS NULL AND kind='note'",
      )
      .get(id, owner)
  )
    throw new HttpError(400, "Choose an available note to link.");
}
export function connectionsFor(id: string): Connections {
  const database = sqlite();
  return {
    incoming: database
      .prepare(
        "SELECT n.id,n.title FROM notes n JOIN note_links l ON l.source_id=n.id WHERE l.target_id=? AND n.trashed_at IS NULL ORDER BY n.updated_at DESC LIMIT 100",
      )
      .all(id) as Connections["incoming"],
    outgoing: database
      .prepare(
        "SELECT n.id,n.title FROM notes n JOIN note_links l ON l.target_id=n.id WHERE l.source_id=? AND n.trashed_at IS NULL ORDER BY n.title LIMIT 100",
      )
      .all(id) as Connections["outgoing"],
    tasks: database
      .prepare(
        "SELECT id,title,completed_at IS NOT NULL AS completed FROM tasks WHERE note_id=? AND trashed_at IS NULL ORDER BY completed_at IS NOT NULL,updated_at DESC LIMIT 100",
      )
      .all(id)
      .map((r) => ({
        ...(r as Connections["tasks"][number]),
        completed: Boolean((r as { completed: number }).completed),
      })),
    bookmarks: database
      .prepare(
        "SELECT id,title,url FROM bookmarks WHERE note_id=? AND trashed_at IS NULL ORDER BY updated_at DESC LIMIT 100",
      )
      .all(id) as Connections["bookmarks"],
  };
}
