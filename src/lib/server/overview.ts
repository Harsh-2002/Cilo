import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db, sqlite } from "./db";
import { bookmarks, notes, tasks } from "./schema";
import type { Overview } from "../types";

export function workspaceOverview(owner: string, today: string): Overview {
  return sqlite().transaction(() => {
    const database = db();
    const open = and(eq(tasks.ownerId, owner), isNull(tasks.completedAt));
    const taskCounts = database
      .select({
        open: count(),
        today: sql<number>`coalesce(sum(case when ${tasks.dueDate} = ${today} then 1 else 0 end), 0)`,
        overdue: sql<number>`coalesce(sum(case when ${tasks.dueDate} < ${today} then 1 else 0 end), 0)`,
      })
      .from(tasks)
      .where(open)
      .get()!;
    return {
      counts: taskCounts,
      tasks: database
        .select({
          id: tasks.id,
          title: tasks.title,
          revision: tasks.revision,
          dueDate: tasks.dueDate,
          recurrence: tasks.recurrence,
        })
        .from(tasks)
        .where(open)
        .orderBy(
          sql`${tasks.dueDate} is null`,
          asc(tasks.dueDate),
          asc(tasks.createdAt),
          asc(tasks.id),
        )
        .limit(5)
        .all(),
      notes: database
        .select({
          id: notes.id,
          title: notes.title,
          updatedAt: notes.updatedAt,
        })
        .from(notes)
        .where(
          and(
            eq(notes.ownerId, owner),
            eq(notes.kind, "note"),
            isNull(notes.trashedAt),
          ),
        )
        .orderBy(desc(notes.updatedAt), asc(notes.id))
        .limit(5)
        .all(),
      bookmarks: database
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          url: bookmarks.url,
          description: bookmarks.description,
          siteName: bookmarks.siteName,
          updatedAt: bookmarks.updatedAt,
        })
        .from(bookmarks)
        .where(eq(bookmarks.ownerId, owner))
        .orderBy(desc(bookmarks.updatedAt), asc(bookmarks.id))
        .limit(4)
        .all(),
      refreshedAt: Date.now(),
    };
  })();
}
