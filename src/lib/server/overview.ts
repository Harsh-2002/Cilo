import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "./db";
import { bookmarks, notes, tasks } from "./schema";
import type { Overview } from "../types";

export function workspaceOverview(owner: string, today: string): Overview {
  return sqlite().transaction(() => {
    const database = db();
    const open = and(
      eq(tasks.ownerId, owner),
      isNull(tasks.completedAt),
      isNull(tasks.trashedAt),
    );
    const taskCounts = sqlite()
      .prepare(
        "SELECT count(*) AS open,coalesce(sum(due_date=?),0) AS today,coalesce(sum(due_date<?),0) AS overdue FROM tasks INDEXED BY tasks_active_counts_idx WHERE owner_id=? AND completed_at IS NULL AND trashed_at IS NULL",
      )
      .get(today, today, owner) as Overview["counts"];
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
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(20)
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
        .limit(20)
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
        .where(and(eq(bookmarks.ownerId, owner), isNull(bookmarks.trashedAt)))
        .orderBy(desc(bookmarks.updatedAt), asc(bookmarks.id))
        .limit(20)
        .all(),
      refreshedAt: Date.now(),
    };
  })();
}
