import { moveToTrash } from "./trash";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "./db";
import { tasks, notes } from "./schema";
import { HttpError } from "./http";
import type { Page, Task, TaskFilter } from "../types";
import { decodeCursor, encodeCursor } from "./pagination";
import { nextDate, validDate, type Recurrence } from "../dates";
import { requireLinkedNote } from "./connections";
const fields = {
  id: tasks.id,
  trashedAt: tasks.trashedAt,
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
export function listTasks(owner: string, includeTrash = false): Task[] {
  return db()
    .select({ ...fields, noteTitle: notes.title })
    .from(tasks)
    .leftJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.kind, "note")))
    .where(
      and(
        eq(tasks.ownerId, owner),
        ...(includeTrash ? [] : [isNull(tasks.trashedAt)]),
      ),
    )
    .orderBy(asc(tasks.createdAt))
    .all();
}
const taskColumns =
  "t.id,t.title,t.completed_at AS completedAt,t.revision,t.created_at AS createdAt,t.updated_at AS updatedAt,t.due_date AS dueDate,t.recurrence,t.recurrence_day AS recurrenceDay,t.parent_task_id AS parentTaskId,t.note_id AS noteId,n.title AS noteTitle";
const taskOrder = "COALESCE(t.due_date,'9999'),t.created_at,t.id";
export function listTaskPage(
  owner: string,
  options: {
    filter: TaskFilter;
    query: string;
    today: string;
    limit: number;
    after?: string | null;
  },
): Page<Task> {
  const where = ["t.owner_id=?", "t.trashed_at IS NULL"];
  const values: (string | number)[] = [owner];
  if (options.filter === "completed") where.push("t.completed_at IS NOT NULL");
  else {
    where.push("t.completed_at IS NULL");
    if (options.filter === "today") {
      where.push("t.due_date IS NOT NULL AND t.due_date<=?");
      values.push(options.today);
    } else if (options.filter === "upcoming") {
      where.push("t.due_date>?");
      values.push(options.today);
    }
  }
  const term = options.query.trim().slice(0, 300);
  if (term) {
    where.push("instr(nivra_fold(t.title),nivra_fold(?))>0");
    values.push(term);
  }
  const cursor = decodeCursor(options.after ?? null, [
    "string",
    "number",
    "string",
  ]);
  if (cursor) {
    where.push(`(${taskOrder})>(?,?,?)`);
    values.push(...cursor);
  }
  const rows = sqlite()
    .prepare(
      `SELECT ${taskColumns} FROM tasks t LEFT JOIN notes n ON n.id=t.note_id AND n.kind='note' WHERE ${where.join(" AND ")} ORDER BY ${taskOrder} LIMIT ?`,
    )
    .all(...values, options.limit + 1) as Task[];
  const items = rows.slice(0, options.limit);
  const last = items[items.length - 1];
  return {
    items,
    next:
      rows.length > options.limit && last
        ? encodeCursor([last.dueDate ?? "9999", last.createdAt, last.id])
        : null,
  };
}
export function taskCounts(owner: string) {
  return sqlite()
    .prepare(
      "SELECT COUNT(*) FILTER (WHERE completed_at IS NULL) AS open,COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed FROM tasks WHERE owner_id=? AND trashed_at IS NULL",
    )
    .get(owner) as { open: number; completed: number };
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
        .where(
          and(
            eq(tasks.id, id),
            eq(tasks.ownerId, owner),
            isNull(tasks.trashedAt),
          ),
        )
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
            .where(
              and(
                eq(tasks.id, id),
                eq(tasks.ownerId, owner),
                isNull(tasks.trashedAt),
              ),
            )
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
        const occurrenceId = randomUUID();
        db()
          .insert(tasks)
          .values({
            id: occurrenceId,
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
        sqlite()
          .prepare(
            "INSERT INTO task_tags(task_id,tag_id) SELECT ?,tag_id FROM task_tags WHERE task_id=?",
          )
          .run(occurrenceId, id);
      }
      return enrich(task);
    })
    .immediate();
}
export function deleteTask(owner: string, id: string, revision: number) {
  moveToTrash(owner, "task", id, revision);
}
