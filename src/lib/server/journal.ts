import { randomUUID } from "node:crypto";
import { db, sqlite } from "./db";
import { notes } from "./schema";
import { getNote } from "./notes";
import { HttpError } from "./http";
import type { Note } from "../types";
// Journal entries are ordinary notes with a date; each day has at most one.
export async function dailyNote(owner: string, date: string): Promise<Note> {
  const existing = sqlite()
    .prepare("SELECT id FROM notes WHERE owner_id=? AND daily_date=?")
    .get(owner, date) as { id: string } | undefined;
  if (existing) {
    const note = getNote(existing.id)!;
    if (note.trashedAt)
      throw new HttpError(
        409,
        "This journal entry is in trash. Restore it before opening the day again.",
      );
    return note;
  }
  const id = randomUUID();
  const now = Date.now();
  try {
    db()
      .insert(notes)
      .values({
        id,
        ownerId: owner,
        title: date,
        document: {
          schemaVersion: 1,
          blocks: [{ type: "paragraph", content: [] }],
        },
        text: "",
        dailyDate: date,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (error) {
    // A concurrent request created the same day first.
    const winner = sqlite()
      .prepare("SELECT id FROM notes WHERE owner_id=? AND daily_date=?")
      .get(owner, date) as { id: string } | undefined;
    if (!winner) throw error;
    return getNote(winner.id)!;
  }
  return getNote(id)!;
}
