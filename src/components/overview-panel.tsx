"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  ExternalLink,
  FileText,
  ListTodo,
  Loader2,
  Menu,
  Plus,
  Repeat2,
} from "lucide-react";
import { api } from "@/lib/client";
import { formatDate, localDate } from "@/lib/dates";
import type { Overview } from "@/lib/types";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { sectionCache } from "@/lib/section-cache";

const snapshotKey = "overview:snapshot";
const freshSnapshot = () => {
  const cached = sectionCache.get<{ date: string; data: Overview }>(
    snapshotKey,
  );
  return cached?.date === localDate() ? cached.data : null;
};
export async function prefetchOverview() {
  if (freshSnapshot()) return;
  const date = localDate();
  sectionCache.set(snapshotKey, {
    date,
    data: await api<Overview>(`overview?date=${date}`),
  });
}
export function OverviewPanel({
  onNavigation,
  onOpenNote,
  onSection,
  onCreate,
}: {
  onNavigation: () => void;
  onOpenNote: (id: string) => Promise<boolean>;
  onSection: (section: "all" | "tasks" | "bookmarks", query?: string) => void;
  onCreate: (kind: "note" | "task" | "bookmark" | "daily") => void;
}) {
  const [data, setData] = useState<Overview | null>(freshSnapshot);
  const [now, setNow] = useState<Date | null>(null);
  const [loading, setLoading] = useState(() => !freshSnapshot());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const date = localDate();
      const snapshot = await api<Overview>(`overview?date=${date}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        sectionCache.set(snapshotKey, { date, data: snapshot });
        setData(snapshot);
        setError("");
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const captured = () => void refresh();
    window.addEventListener("nivra:captured", captured);
    return () => window.removeEventListener("nivra:captured", captured);
  }, [refresh]);
  useEffect(() => {
    let clock: ReturnType<typeof setTimeout>;
    let polling: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      setNow(new Date());
      clock = setTimeout(tick, 60000 - (Date.now() % 60000));
    };
    const resume = () => {
      clearTimeout(clock);
      clearInterval(polling);
      if (document.visibilityState === "hidden") {
        request.current?.abort();
        return;
      }
      tick();
      void refresh();
      polling = setInterval(() => void refresh(), 30000);
    };
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const start = setTimeout(resume, 0);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(start);
      clearTimeout(clock);
      clearInterval(polling);
      request.current?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function complete(task: Overview["tasks"][number]) {
    setBusy(task.id);
    try {
      await api(`tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: task.revision, completed: true }),
      });
      sectionCache.clear("tasks:");
      await refresh();
      toast.success(
        task.recurrence
          ? "Task completed. Next occurrence created."
          : "Task completed.",
      );
    } catch (e) {
      toast.error((e as Error).message);
      await refresh();
    } finally {
      setBusy(null);
    }
  }
  const today = now ? localDate(now) : "";
  const empty = (
    message: string,
    action: string,
    kind: "note" | "task" | "bookmark",
  ) => (
    <div className="overview-empty">
      <p>{message}</p>
      <Button variant="outline" onClick={() => onCreate(kind)}>
        <Plus size={14} />
        {action}
      </Button>
    </div>
  );
  return (
    <section className="overview-panel" aria-label="Overview">
      <div
        className="overview-scroll"
        tabIndex={0}
        role="region"
        aria-label="Your overview"
      >
        <div className="overview-content">
          <Button
            variant="ghost"
            size="icon"
            className="menu-toggle overview-navigation"
            aria-label="Open navigation"
            onClick={onNavigation}
          >
            <Menu size={18} />
          </Button>
          <div className="overview-intro">
            <div className="overview-clock">
              <time dateTime={today || undefined} aria-label="Today's date">
                {now
                  ? now.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Loading date…"}
              </time>
              <time dateTime={now?.toISOString()} aria-label="Current time">
                {now
                  ? now.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </time>
              <span>Local time</span>
            </div>
          </div>
          <div className="overview-actions" aria-label="Quick actions">
            <Button onClick={() => onCreate("note")}>
              <Plus size={16} />
              New note
            </Button>
            <Button variant="outline" onClick={() => onCreate("task")}>
              <ListTodo size={16} />
              Add task
            </Button>
            <Button variant="outline" onClick={() => onCreate("bookmark")}>
              <Bookmark size={16} />
              Save link
            </Button>
            <Button variant="ghost" onClick={() => onCreate("daily")}>
              <CalendarDays size={16} />
              Journal
            </Button>
          </div>
          {error && (
            <div className="overview-error" role="alert">
              <p>
                {data
                  ? "Overview could not update. Showing the last loaded items. "
                  : "Overview could not load. "}
                {error}
              </p>
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => void refresh()}
              >
                Try again
              </Button>
            </div>
          )}
          {!data && loading ? (
            <div className="overview-grid" role="status">
              <span className="sr-only">Loading your overview…</span>
              {["overview-tasks", "overview-notes", "overview-bookmarks"].map(
                (panel) => (
                  <div
                    key={panel}
                    className={`overview-widget overview-skeleton ${panel}`}
                    aria-hidden="true"
                  >
                    <div />
                    {Array.from(
                      { length: panel === "overview-tasks" ? 5 : 3 },
                      (_, row) => row,
                    ).map((row) => (
                      <div key={row}>
                        <span />
                        <span />
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
          ) : (
            data && (
              <div className="overview-grid">
                <section
                  className="overview-widget overview-tasks"
                  aria-labelledby="overview-tasks-title"
                >
                  <header>
                    <h3 id="overview-tasks-title">
                      Open tasks <span>{data.counts.open}</span>
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSection("tasks")}
                      aria-label="View all tasks"
                    >
                      View all
                      <ArrowRight size={14} />
                    </Button>
                  </header>
                  <p className="overview-task-summary">
                    {data.counts.overdue > 0
                      ? `${data.counts.overdue} overdue · `
                      : ""}
                    {data.counts.today} due today
                  </p>
                  {data.tasks.length ? (
                    <ul>
                      {data.tasks.map((task) => (
                        <li key={task.id} className="overview-task-row">
                          <div className="overview-check">
                            <Checkbox
                              checked={false}
                              disabled={!!busy}
                              aria-label={`Complete ${task.title}`}
                              onCheckedChange={() => void complete(task)}
                            />
                            {busy === task.id && (
                              <Loader2
                                size={12}
                                className="animate-spin"
                                aria-label="Completing task"
                              />
                            )}
                          </div>
                          <button
                            className="overview-task-link"
                            onClick={() => onSection("tasks", task.title)}
                          >
                            <strong>{task.title}</strong>
                            <span>
                              {task.dueDate
                                ? task.dueDate < today
                                  ? `Overdue · ${formatDate(task.dueDate)}`
                                  : task.dueDate === today
                                    ? "Due today"
                                    : formatDate(task.dueDate)
                                : "No due date"}
                              {task.recurrence && (
                                <>
                                  <Repeat2 size={12} />
                                  {task.recurrence}
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    empty(
                      "Nothing left open. Make room for your next task.",
                      "Add a task",
                      "task",
                    )
                  )}
                  {data.counts.open > data.tasks.length && (
                    <p className="overview-more">
                      Showing {data.tasks.length} of {data.counts.open} open
                      tasks, earliest due first.
                    </p>
                  )}
                </section>
                <section
                  className="overview-widget overview-notes"
                  aria-labelledby="overview-notes-title"
                >
                  <header>
                    <h3 id="overview-notes-title">Recent notes</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSection("all")}
                      aria-label="View all notes"
                    >
                      View all
                      <ArrowRight size={14} />
                    </Button>
                  </header>
                  {data.notes.length ? (
                    <ul>
                      {data.notes.map((note) => (
                        <li key={note.id}>
                          <button
                            className="overview-note-link"
                            onClick={() => void onOpenNote(note.id)}
                          >
                            <FileText size={16} />
                            <span>
                              <strong>{note.title || "Untitled"}</strong>
                              <small>
                                Edited{" "}
                                {new Date(note.updatedAt).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )}
                              </small>
                            </span>
                            <ArrowRight size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    empty(
                      "A thought, an idea, a place to start.",
                      "Create a note",
                      "note",
                    )
                  )}
                </section>
                <section
                  className="overview-widget overview-bookmarks"
                  aria-labelledby="overview-bookmarks-title"
                >
                  <header>
                    <h3 id="overview-bookmarks-title">Recent bookmarks</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSection("bookmarks")}
                      aria-label="View all bookmarks"
                    >
                      View all
                      <ArrowRight size={14} />
                    </Button>
                  </header>
                  {data.bookmarks.length ? (
                    <ul>
                      {data.bookmarks.map((bookmark) => (
                        <li key={bookmark.id}>
                          <a
                            className="overview-bookmark-link"
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Bookmark size={16} />
                            <span>
                              <strong>{bookmark.title || bookmark.url}</strong>
                              <small>
                                {bookmark.siteName ||
                                  new URL(bookmark.url).hostname}
                              </small>
                              {bookmark.description && (
                                <p>{bookmark.description}</p>
                              )}
                            </span>
                            <ExternalLink
                              size={14}
                              aria-label="Opens in a new tab"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    empty(
                      "Keep something worth coming back to.",
                      "Save a link",
                      "bookmark",
                    )
                  )}
                </section>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
