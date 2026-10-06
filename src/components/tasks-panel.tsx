"use client";
import { LoadingState } from "./loading-state";
import { useCompletion } from "@/lib/completion-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  CalendarDays,
  Repeat2,
  FileText,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import type { Page, Task } from "@/lib/types";
import { sectionCache } from "@/lib/section-cache";
import { formatDate, localDate, type Recurrence } from "@/lib/dates";
import { DatePicker } from "./date-picker";
import { NotePicker } from "./note-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { SectionHeading } from "./section-heading";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useConfirm } from "./confirm-provider";
import type { CapturedItem } from "./quick-capture";

type TaskCounts = { open: number; completed: number };
type TaskList = { items: Task[]; next: string | null };
const listKey = (filter: string) => `tasks:list:${filter}`;
const taskParams = (filter: string, query: string) =>
  new URLSearchParams({
    filter,
    today: localDate(),
    limit: "60",
    ...(query.trim() ? { q: query.trim() } : {}),
  });
const compareTasks = (a: Task, b: Task) =>
  (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
  a.createdAt - b.createdAt ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function mergeTasks(items: Task[], incoming: Task[]) {
  const replaced = new Set(incoming.map((task) => task.id));
  return [...items.filter((task) => !replaced.has(task.id)), ...incoming].sort(
    compareTasks,
  );
}
export function TasksPanel({
  onNavigation,
  registerGuard,
  initialQuery = "",
  initialFilter = "open",
  focusCreate = false,
  onOpenNote,
}: {
  onNavigation: () => void;
  registerGuard: (guard: () => Promise<boolean>) => void;
  initialQuery?: string;
  initialFilter?: "open" | "completed";
  focusCreate?: boolean;
  onOpenNote: (id: string) => Promise<boolean>;
}) {
  const warm = sectionCache.get<TaskList>(listKey(initialFilter));
  const [tasks, setTasks] = useState<Task[]>(warm?.items ?? []);
  const [next, setNext] = useState<string | null>(warm?.next ?? null);
  const [listFilter, setListFilter] = useState(warm ? initialFilter : "");
  const [counts, setCounts] = useState<TaskCounts | null>(
    () => sectionCache.get<TaskCounts>("tasks:counts") ?? null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<
    "open" | "completed" | "today" | "upcoming"
  >(initialFilter);
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editRepeat, setEditRepeat] = useState<Recurrence | null>(null);
  const [editNote, setEditNote] = useState<{
    id: string | null;
    title: string | null;
  }>({ id: null, title: null });
  const [loading, setLoading] = useState(!warm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const invalidate = () => sectionCache.clear("tasks:list:", "overview");
  const confirm = useConfirm();
  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await api<TaskCounts>("tasks?summary=1"));
    } catch {}
  }, []);
  useEffect(() => {
    const received = (event: Event) => {
      const result = (event as CustomEvent<CapturedItem>).detail;
      if (result.type !== "task") return;
      void refreshCounts();
      if (filter === "open" && !query.trim() && next === null)
        setTasks((items) => mergeTasks(items, [result.item]));
    };
    window.addEventListener("nivra:captured", received);
    return () => window.removeEventListener("nivra:captured", received);
  }, [filter, query, next, refreshCounts]);
  const editDirty =
    !!editing &&
    (editTitle !== editing.title ||
      editDate !== editing.dueDate ||
      editRepeat !== editing.recurrence ||
      editNote.id !== editing.noteId);
  useEffect(() => {
    if (focusCreate) input.current?.focus();
  }, [focusCreate]);
  const view = `${filter}\n${query}`;
  const currentView = useRef(view);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      currentView.current = view;
      setLoading(true);
      try {
        const [first, summary] = await Promise.all([
          api<Page<Task>>(`tasks?${taskParams(filter, query)}`, { signal }),
          api<TaskCounts>("tasks?summary=1", { signal }),
        ]);
        if (signal?.aborted) return;
        setTasks(first.items);
        setNext(first.next);
        setListFilter(filter);
        setCounts(summary);
        setError("");
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filter, query, view],
  );
  useCompletion(undefined, () => {
    if (!editing) void load();
  });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => void load(controller.signal),
      query.trim() ? 180 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, query]);
  useEffect(() => {
    if (listFilter === filter && !query.trim() && !loading)
      sectionCache.set(listKey(filter), { items: tasks, next });
    if (counts) sectionCache.set("tasks:counts", counts);
  }, [tasks, next, counts, listFilter, filter, query, loading]);
  async function loadMore() {
    if (!next || loadingMore) return;
    const started = view;
    setLoadingMore(true);
    try {
      const more = await api<Page<Task>>(
        `tasks?${taskParams(filter, query)}&after=${encodeURIComponent(next)}`,
      );
      if (currentView.current !== started) return;
      setTasks((items) => mergeTasks(items, more.items));
      setNext(more.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  useEffect(() => {
    registerGuard(
      async () =>
        !busy &&
        (!(title.trim() || editDirty) ||
          (await confirm({
            title: "Discard unfinished task?",
            description:
              "Your task text has not been saved. Stay here to finish it, or discard it before leaving.",
            action: "Discard",
          }))),
    );
    return () => registerGuard(async () => true);
  }, [busy, title, editDirty, registerGuard, confirm]);
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (busy || title.trim() || editDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("beforeunload", leaving);
    };
  }, [busy, title, editDirty]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await load();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    await mutate(async () => {
      const task = await api<Task>("tasks", {
        method: "POST",
        body: JSON.stringify({ title: title.trim() }),
      });
      invalidate();
      if (filter === "open" && !query.trim() && next === null)
        setTasks((items) => mergeTasks(items, [task]));
      setTitle("");
      setFilter("open");
      setQuery("");
      void refreshCounts();
      input.current?.focus();
    });
  }
  async function update(
    task: Task,
    change: {
      title?: string;
      completed?: boolean;
      dueDate?: string | null;
      recurrence?: Recurrence | null;
      noteId?: string | null;
    },
  ) {
    await mutate(async () => {
      const updated = await api<Task>(`tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: task.revision, ...change }),
      });
      invalidate();
      setTasks((items) => mergeTasks(items, [updated]));
      if (change.completed && task.recurrence) await load();
      else void refreshCounts();
      if (change.title !== undefined) setEditing(null);
    });
  }
  const today = localDate();
  const cached = query.trim()
    ? undefined
    : sectionCache.get<TaskList>(listKey(filter));
  const ready = listFilter === filter;
  const rows = ready ? tasks : cached?.items;
  const hasMore = ready ? next !== null : !!cached?.next;
  const visible = (rows ?? [])
    .filter(
      (t) =>
        (filter === "completed"
          ? t.completedAt !== null
          : t.completedAt === null &&
            (filter === "today"
              ? !!t.dueDate && t.dueDate <= today
              : filter === "upcoming"
                ? !!t.dueDate && t.dueDate > today
                : true)) &&
        t.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .sort(compareTasks);
  return (
    <section className="tasks-panel" aria-label="Tasks">
      <div className="tasks-scroll">
        <div className="tasks-content section-content">
          <SectionHeading
            title="Tasks"
            description="A place for what you want to get done."
            onNavigation={onNavigation}
          />
          <form className="task-create section-create" onSubmit={add}>
            <div className="section-create-field">
              <Label htmlFor="task-title">Task</Label>
              <Input
                id="task-title"
                ref={input}
                aria-label="New task"
                placeholder="What needs doing?"
                value={title}
                maxLength={300}
                disabled={busy || !!editing}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy || !!editing || !title.trim()}>
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              {busy ? "Adding…" : "Add task"}
            </Button>
          </form>
          <div className="tasks-toolbar section-toolbar">
            <div className="task-filters" role="group" aria-label="Task status">
              <Button
                variant="ghost"
                aria-pressed={filter === "open"}
                disabled={busy || !!editing}
                onClick={() => setFilter("open")}
              >
                Open<span>{counts?.open}</span>
              </Button>
              <Button
                variant="ghost"
                aria-pressed={filter === "today"}
                disabled={busy || !!editing}
                onClick={() => setFilter("today")}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                aria-pressed={filter === "upcoming"}
                disabled={busy || !!editing}
                onClick={() => setFilter("upcoming")}
              >
                Upcoming
              </Button>
              <Button
                variant="ghost"
                aria-pressed={filter === "completed"}
                disabled={busy || !!editing}
                onClick={() => setFilter("completed")}
              >
                Completed<span>{counts?.completed}</span>
              </Button>
            </div>
            <div className="section-filter-select">
              <Select
                value={filter}
                onValueChange={(value) => setFilter(value as typeof filter)}
                disabled={busy || !!editing}
              >
                <SelectTrigger aria-label="Task status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    Open · {counts?.open ?? "…"}
                  </SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="completed">
                    Completed · {counts?.completed ?? "…"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="task-search">
              <Search size={15} />
              <Input
                disabled={busy || !!editing}
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <div className="tasks-error" role="alert">
              <p>{error}</p>
              <Button
                variant="outline"
                disabled={busy || !!editing}
                onClick={() => void load()}
              >
                Retry
              </Button>
            </div>
          )}
          {rows === undefined && !error ? (
            <LoadingState kind="tasks" label="Loading tasks" />
          ) : visible.length ? (
            <ul
              className="task-list"
              aria-busy={loading}
              aria-label={`${filter === "open" ? "Open" : filter === "completed" ? "Completed" : filter === "today" ? "Today" : "Upcoming"} tasks`}
            >
              {visible.map((task) => (
                <li
                  key={task.id}
                  className={`task-row ${task.completedAt !== null ? "is-complete" : ""}`}
                >
                  <div className="task-check">
                    <Checkbox
                      checked={task.completedAt !== null}
                      disabled={busy || !!editing}
                      aria-label={`${task.completedAt !== null ? "Reopen" : "Complete"} ${task.title}`}
                      onCheckedChange={(checked) =>
                        void update(task, { completed: checked === true })
                      }
                    />
                  </div>
                  {editing?.id === task.id ? (
                    <form
                      className="task-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editTitle.trim())
                          void update(task, {
                            title: editTitle.trim(),
                            dueDate: editDate,
                            recurrence: editRepeat,
                            noteId: editNote.id,
                          });
                      }}
                    >
                      <Input
                        autoFocus
                        aria-label="Edit task"
                        value={editTitle}
                        maxLength={300}
                        disabled={busy}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <div className="task-schedule-controls">
                        <DatePicker
                          value={editDate}
                          disabled={busy}
                          onChange={(date) => {
                            setEditDate(date);
                            if (!date) setEditRepeat(null);
                          }}
                        />
                        <Select
                          value={editRepeat || "none"}
                          disabled={busy || !editDate}
                          onValueChange={(value) =>
                            setEditRepeat(
                              value === "none" ? null : (value as Recurrence),
                            )
                          }
                        >
                          <SelectTrigger aria-label="Task recurrence">
                            <Repeat2 size={14} />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Does not repeat
                            </SelectItem>
                            <SelectItem value="daily">Every day</SelectItem>
                            <SelectItem value="weekly">Every week</SelectItem>
                            <SelectItem value="monthly">Every month</SelectItem>
                          </SelectContent>
                        </Select>
                        <NotePicker
                          value={editNote.id}
                          title={editNote.title}
                          disabled={busy}
                          onChange={(id, title) => setEditNote({ id, title })}
                        />
                      </div>
                      <div className="task-edit-actions">
                        <Button
                          type="submit"
                          disabled={busy || !editTitle.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="task-copy">
                      <span className="task-title">{task.title}</span>
                      <div className="task-metadata">
                        {task.dueDate && (
                          <span
                            className={
                              task.completedAt === null && task.dueDate < today
                                ? "is-overdue"
                                : ""
                            }
                          >
                            <CalendarDays size={12} />
                            {task.completedAt === null && task.dueDate < today
                              ? "Overdue · "
                              : ""}
                            {task.dueDate === today
                              ? "Today"
                              : formatDate(task.dueDate)}
                          </span>
                        )}
                        {task.recurrence && (
                          <span>
                            <Repeat2 size={12} />
                            {task.recurrence === "daily"
                              ? "Daily"
                              : task.recurrence === "weekly"
                                ? "Weekly"
                                : "Monthly"}
                          </span>
                        )}
                        {task.noteId && (
                          <button
                            className="linked-note-chip"
                            aria-label={`Open linked note ${task.noteTitle || "Untitled"}`}
                            disabled={busy}
                            onClick={() => void onOpenNote(task.noteId!)}
                          >
                            <FileText size={12} />
                            {task.noteTitle || "Untitled"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${task.title}`}
                        disabled={busy || !!editing}
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(task);
                          setEditTitle(task.title);
                          setEditDate(task.dueDate);
                          setEditRepeat(task.recurrence);
                          setEditNote({
                            id: task.noteId,
                            title: task.noteTitle,
                          });
                        }}
                      >
                        <Pencil size={15} />
                        Edit task
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void (async () => {
                            if (
                              await confirm({
                                title: "Delete this task?",
                                description:
                                  "The task will move to Trash. You can restore it there.",
                                action: "Delete task",
                              })
                            )
                              await mutate(async () => {
                                await api(`tasks/${task.id}`, {
                                  method: "DELETE",
                                  body: JSON.stringify({
                                    revision: task.revision,
                                  }),
                                });
                                invalidate();
                                setTasks((items) =>
                                  items.filter((item) => item.id !== task.id),
                                );
                                void refreshCounts();
                                if (editing?.id === task.id) setEditing(null);
                              });
                          })()
                        }
                      >
                        <Trash2 size={15} />
                        Delete task
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tasks-empty">
              {query ? (
                <Search size={28} strokeWidth={1.5} />
              ) : filter === "completed" ? (
                <CheckCheck size={30} strokeWidth={1.5} />
              ) : (
                <ListTodo size={30} strokeWidth={1.5} />
              )}
              <h3>
                {query
                  ? "No matching tasks."
                  : filter === "completed"
                    ? "Your finished tasks will live here."
                    : filter === "today"
                      ? "Nothing due today."
                      : filter === "upcoming"
                        ? "Nothing scheduled ahead."
                        : counts && counts.open + counts.completed
                          ? "Everything is checked off."
                          : "Make room for your next step."}
              </h3>
              <p>
                {query
                  ? "Try another search."
                  : filter === "completed"
                    ? "Check off an open task to keep track of your progress."
                    : filter === "today" || filter === "upcoming"
                      ? "Edit a task to give it a due date."
                      : "Add a task above. Check it off when you’re done."}
              </p>
            </div>
          )}
          {hasMore && (
            <div className="list-continuation">
              <Button
                variant="ghost"
                disabled={busy || loadingMore || !!editing}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Loading…" : "Load more tasks"}
              </Button>
            </div>
          )}
          {rows !== undefined && (
            <p className="task-summary" aria-live="polite">
              {counts
                ? `${counts.open} open · ${counts.completed} completed`
                : "\u00a0"}
              {busy && <Loader2 size={13} className="animate-spin" />}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
