"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  ListTodo,
  Loader2,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  CalendarDays,
  Repeat2,
  FileText,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import type { Task } from "@/lib/types";
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
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useConfirm } from "./confirm-provider";
import type { CapturedItem } from "./quick-capture";

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState({ key: "", count: 60 });
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  useEffect(() => {
    const received = (event: Event) => {
      const result = (event as CustomEvent<CapturedItem>).detail;
      if (result.type === "task") setTasks((items) => [...items, result.item]);
    };
    window.addEventListener("cilo:captured", received);
    return () => window.removeEventListener("cilo:captured", received);
  }, []);
  const editDirty =
    !!editing &&
    (editTitle !== editing.title ||
      editDate !== editing.dueDate ||
      editRepeat !== editing.recurrence ||
      editNote.id !== editing.noteId);
  useEffect(() => {
    if (focusCreate) input.current?.focus();
  }, [focusCreate]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await api<Task[]>("tasks"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
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
      if (e instanceof ApiError && e.status === 409)
        setTasks(await api<Task[]>("tasks").catch(() => tasks));
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
      setTasks((t) => [...t, task]);
      setTitle("");
      setFilter("open");
      setQuery("");
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
      const next = await api<Task>(`tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: task.revision, ...change }),
      });
      setTasks((t) => t.map((item) => (item.id === next.id ? next : item)));
      if (change.completed && task.recurrence)
        setTasks(await api<Task[]>("tasks"));
      if (change.title !== undefined) setEditing(null);
    });
  }
  const openCount = tasks.filter((t) => t.completedAt === null).length;
  const today = localDate();
  const pageKey = `${filter}:${query}`;
  const visibleCount = page.key === pageKey ? page.count : 60;
  const visible = tasks
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
    .sort(
      (a, b) =>
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
        a.createdAt - b.createdAt,
    );
  return (
    <section className="tasks-panel" aria-label="Tasks">
      <header className="tasks-header">
        <Button
          variant="ghost"
          size="icon"
          className="menu-toggle"
          aria-label="Open navigation"
          onClick={onNavigation}
        >
          <Menu size={18} />
        </Button>
        <h1>Tasks</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh tasks"
          disabled={busy || loading || !!editing}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </Button>
      </header>
      <div className="tasks-scroll">
        <div className="tasks-content">
          <div className="tasks-intro">
            <h2>One thing at a time.</h2>
            <p>A place for what you want to get done.</p>
          </div>
          <form className="task-create" onSubmit={add}>
            <Input
              ref={input}
              aria-label="New task"
              placeholder="What needs doing?"
              value={title}
              maxLength={300}
              disabled={busy || !!editing}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" disabled={busy || !!editing || !title.trim()}>
              <Plus size={16} />
              Add task
            </Button>
          </form>
          <div className="tasks-toolbar">
            <div className="task-filters" role="group" aria-label="Task status">
              <Button
                variant="ghost"
                aria-pressed={filter === "open"}
                disabled={busy || !!editing}
                onClick={() => setFilter("open")}
              >
                Open<span>{openCount}</span>
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
                Completed<span>{tasks.length - openCount}</span>
              </Button>
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
          {loading ? (
            <div
              className="task-skeleton"
              role="status"
              aria-label="Loading tasks"
              aria-busy="true"
            >
              <span />
              <span />
              <span />
            </div>
          ) : visible.length ? (
            <ul
              className="task-list"
              aria-label={`${filter === "open" ? "Open" : filter === "completed" ? "Completed" : filter === "today" ? "Today" : "Upcoming"} tasks`}
            >
              {visible.slice(0, visibleCount).map((task) => (
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
                                  "This permanently removes the task from your list.",
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
                                setTasks((t) =>
                                  t.filter((item) => item.id !== task.id),
                                );
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
                        : tasks.length
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
          {visible.length > visibleCount && (
            <div className="list-continuation">
              <Button
                variant="ghost"
                disabled={busy || !!editing}
                onClick={() =>
                  setPage({ key: pageKey, count: visibleCount + 60 })
                }
              >
                Load more tasks
              </Button>
            </div>
          )}
          <p className="task-summary" aria-live="polite">
            {openCount} open · {tasks.length - openCount} completed
            {busy && <Loader2 size={13} className="animate-spin" />}
          </p>
        </div>
      </div>
    </section>
  );
}
