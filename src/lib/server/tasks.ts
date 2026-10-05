import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, sqlite } from "./db";
import { tasks, notes } from "./schema";
import { HttpError } from "./http";
import type { Task } from "../types";
import { nextDate, validDate, type Recurrence } from "../dates";
import { requireLinkedNote } from "./connections";
const fields = {
  id: tasks.id,
  title: tasks.title,
  completedAt: tasks.completedAt,
  revision: tasks.revision,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  dueDate: tasks.dueDate,
  recurrence: tasks.recurrence,
  recurrenceDay: tasks.recurrenceDay,
  parentTaskId: tasks.parentTaskId,
  noteId: tasks.noteId,
};
export type TaskChanges = {
  title?: string;
  completed?: boolean;
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  noteId?: string | null;
};
function enrich(task: Omit<Task, "noteTitle">): Task {
  const note = task.noteId
    ? db()
        .select({ title: notes.title })
        .from(notes)
        .where(and(eq(notes.id, task.noteId), eq(notes.kind, "note")))
        .get()
    : undefined;
  return { ...task, noteTitle: note?.title ?? null };
}
export function listTasks(owner: string): Task[] {
  return db()
    .select({ ...fields, noteTitle: notes.title })
    .from(tasks)
    .leftJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.kind, "note")))
    .where(eq(tasks.ownerId, owner))
    .orderBy(asc(tasks.createdAt))
    .all();
}
export function createTask(
  owner: string,
  title: string,
  options: Omit<TaskChanges, "title" | "completed"> = {},
): Task {
  const now = Date.now();
  requireLinkedNote(owner, options.noteId);
  if (options.recurrence && !options.dueDate)
    throw new HttpError(400, "Choose a due date before repeating a task.");
  return enrich(
    db()
      .insert(tasks)
      .values({
        id: randomUUID(),
        ownerId: owner,
        title,
        createdAt: now,
        updatedAt: now,
        dueDate: options.dueDate,
        recurrence: options.recurrence,
        recurrenceDay: options.dueDate
          ? Number(options.dueDate.slice(8))
          : null,
        noteId: options.noteId,
      })
      .returning(fields)
      .get(),
  );
}
export function updateTask(
  owner: string,
  id: string,
  input: TaskChanges & { revision: number },
): Task {
  return sqlite()
    .transaction(() => {
      const previous = db()
        .select(fields)
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.ownerId, owner)))
        .get();
      if (!previous) throw new HttpError(404, "This task was not found.");
      if (previous.revision !== input.revision)
        throw new HttpError(
          409,
          "This task changed in another tab. Refresh tasks and try again.",
        );
      requireLinkedNote(owner, input.noteId);
      const due =
        input.dueDate === undefined ? previous.dueDate : input.dueDate;
      const repeat =
        input.recurrence === undefined ? previous.recurrence : input.recurrence;
      if (repeat && !due)
        throw new HttpError(400, "Choose a due date before repeating a task.");
      const anchor =
        input.dueDate !== undefined && due !== previous.dueDate
          ? due
            ? Number(due.slice(8))
            : null
          : previous.recurrenceDay;
      const task = db()
        .update(tasks)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.completed !== undefined
            ? { completedAt: input.completed ? Date.now() : null }
            : {}),
          revision: input.revision + 1,
          updatedAt: Date.now(),
          ...(input.dueDate !== undefined
            ? { dueDate: input.dueDate, recurrenceDay: anchor }
            : {}),
          ...(input.recurrence !== undefined
            ? { recurrence: input.recurrence }
            : {}),
          ...(input.noteId !== undefined ? { noteId: input.noteId } : {}),
        })
        .where(
          and(
            eq(tasks.id, id),
            eq(tasks.ownerId, owner),
            eq(tasks.revision, input.revision),
          ),
        )
        .returning(fields)
        .get();
      if (!task) {
        if (
          !db()
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.ownerId, owner)))
            .get()
        )
          throw new HttpError(404, "This task was not found.");
        throw new HttpError(
          409,
          "This task changed in another tab. Refresh tasks and try again.",
        );
      }
      if (
        input.completed === true &&
        previous.completedAt === null &&
        repeat &&
        due &&
        !db()
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.parentTaskId, id))
          .get()
      ) {
        const following = nextDate(due, repeat, anchor ?? undefined);
        if (!validDate(following))
          throw new HttpError(
            400,
            "The next occurrence is outside the supported date range.",
          );
        db()
          .insert(tasks)
          .values({
            id: randomUUID(),
            ownerId: owner,
            title: task.title,
            dueDate: following,
            recurrence: repeat,
            recurrenceDay: anchor,
            parentTaskId: id,
            noteId: task.noteId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          .run();
      }
      return enrich(task);
    })
    .immediate();
}
export function deleteTask(owner: string, id: string, revision: number) {
  const removed = db()
    .delete(tasks)
    .where(
      and(
        eq(tasks.id, id),
        eq(tasks.ownerId, owner),
        eq(tasks.revision, revision),
      ),
    )
    .returning({ id: tasks.id })
    .get();
  if (!removed)
    throw new HttpError(
      409,
      "This task changed or was removed. Refresh tasks and try again.",
    );
}
