import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./schema";
import { HttpError } from "./http";
import type { Task } from "../types";
const fields = {
  id: tasks.id,
  title: tasks.title,
  completedAt: tasks.completedAt,
  revision: tasks.revision,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};
export function listTasks(owner: string): Task[] {
  return db()
    .select(fields)
    .from(tasks)
    .where(eq(tasks.ownerId, owner))
    .orderBy(asc(tasks.createdAt))
    .all();
}
export function createTask(owner: string, title: string): Task {
  const now = Date.now();
  return db()
    .insert(tasks)
    .values({
      id: randomUUID(),
      ownerId: owner,
      title,
      createdAt: now,
      updatedAt: now,
    })
    .returning(fields)
    .get();
}
export function updateTask(
  owner: string,
  id: string,
  input: { revision: number; title?: string; completed?: boolean },
): Task {
  const task = db()
    .update(tasks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.completed !== undefined
        ? { completedAt: input.completed ? Date.now() : null }
        : {}),
      revision: input.revision + 1,
      updatedAt: Date.now(),
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
  return task;
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
