import { randomUUID } from "node:crypto";
import { db, sqlite } from "./db";
import { notes, attachments } from "./schema";
import { getNote } from "./notes";
import { storage } from "./storage";
import { HttpError } from "./http";
import { plainText } from "./validation";
import { syncNoteLinks } from "./connections";
import { remapDocument } from "../document";
import { eq } from "drizzle-orm";
import type { Document, Note } from "../types";
const heading = (text: string) => ({
  type: "heading",
  props: { level: 2 },
  content: [{ type: "text", text, styles: {} }],
});
const paragraph = (text = "") => ({
  type: "paragraph",
  content: text ? [{ type: "text", text, styles: {} }] : [],
});
const starters = [
  {
    title: "Journal",
    blocks: [
      heading("What’s on your mind?"),
      paragraph(),
      heading("Today’s focus"),
      { type: "checkListItem", props: { checked: false }, content: [] },
      heading("Reflection"),
      paragraph(),
    ],
  },
  {
    title: "Meeting",
    blocks: [
      heading("Agenda"),
      paragraph(),
      heading("Notes"),
      paragraph(),
      heading("Next steps"),
      { type: "checkListItem", props: { checked: false }, content: [] },
    ],
  },
  {
    title: "Project",
    blocks: [
      heading("Goal"),
      paragraph(),
      heading("Context"),
      paragraph(),
      heading("Next steps"),
      { type: "checkListItem", props: { checked: false }, content: [] },
    ],
  },
];
export function ensureTemplates(owner: string) {
  const database = sqlite();
  database
    .transaction(() => {
      if (
        (
          database
            .prepare(
              "SELECT templates_seeded AS seeded FROM instance WHERE id=1",
            )
            .get() as { seeded: number }
        ).seeded
      )
        return;
      let journal = "";
      for (const starter of starters) {
        const id = randomUUID();
        const document: Document = { schemaVersion: 1, blocks: starter.blocks };
        db()
          .insert(notes)
          .values({
            id,
            ownerId: owner,
            title: starter.title,
            document,
            text: plainText(document.blocks),
            kind: "template",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          .run();
        if (starter.title === "Journal") journal = id;
      }
      database
        .prepare(
          "UPDATE instance SET templates_seeded=1,daily_template_id=? WHERE id=1",
        )
        .run(journal);
    })
    .immediate();
}
export async function instantiate(
  owner: string,
  source: Note | undefined,
  options: { title: string; kind?: "note" | "template"; dailyDate?: string },
): Promise<Note> {
  if (
    source &&
    (source.trashedAt ||
      !sqlite()
        .prepare("SELECT 1 FROM notes WHERE id=? AND owner_id=?")
        .get(source.id, owner))
  )
    throw new HttpError(400, "Choose an available template.");
  const id = randomUUID();
  const files = source
    ? db()
        .select()
        .from(attachments)
        .where(eq(attachments.noteId, source.id))
        .all()
    : [];
  const copied: { id: string; original: (typeof files)[number] }[] = [];
  try {
    for (const original of files) {
      const next = randomUUID();
      await storage.write(next, await storage.read(original.storageKey));
      copied.push({ id: next, original });
    }
    const document = remapDocument(
      source?.document || { schemaVersion: 1, blocks: [paragraph()] },
      new Map(copied.map((f) => [f.original.id, f.id])),
    );
    sqlite()
      .transaction(() => {
        db()
          .insert(notes)
          .values({
            id,
            ownerId: owner,
            title: options.title,
            document,
            text: plainText(document.blocks),
            kind: options.kind || "note",
            dailyDate: options.dailyDate,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          .run();
        for (const f of copied)
          db()
            .insert(attachments)
            .values({
              ...f.original,
              id: f.id,
              noteId: id,
              storageKey: f.id,
              createdAt: Date.now(),
            })
            .run();
        syncNoteLinks(id, document);
      })
      .immediate();
    return getNote(id)!;
  } catch (error) {
    await Promise.all(copied.map((f) => storage.delete(f.id)));
    if (options.dailyDate) {
      const existing = sqlite()
        .prepare("SELECT id FROM notes WHERE owner_id=? AND daily_date=?")
        .get(owner, options.dailyDate) as { id: string } | undefined;
      if (existing) {
        const note = getNote(existing.id)!;
        if (note.trashedAt)
          throw new HttpError(
            409,
            "This daily note is in trash. Restore it before opening the day again.",
          );
        return note;
      }
    }
    throw error;
  }
}
export async function dailyNote(owner: string, date: string): Promise<Note> {
  ensureTemplates(owner);
  const existing = sqlite()
    .prepare("SELECT id FROM notes WHERE owner_id=? AND daily_date=?")
    .get(owner, date) as { id: string } | undefined;
  if (existing) {
    const note = getNote(existing.id)!;
    if (note.trashedAt)
      throw new HttpError(
        409,
        "This daily note is in trash. Restore it before opening the day again.",
      );
    return note;
  }
  const setting = sqlite()
    .prepare("SELECT daily_template_id AS id FROM instance WHERE id=1")
    .get() as { id: string | null };
  const template = setting.id ? getNote(setting.id) : undefined;
  return instantiate(
    owner,
    template?.kind === "template" && !template.trashedAt ? template : undefined,
    { title: date, dailyDate: date },
  );
}
