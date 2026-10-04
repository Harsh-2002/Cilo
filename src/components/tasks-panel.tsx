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
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import type { Task } from "@/lib/types";
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

export function TasksPanel({
  onNavigation,
  registerGuard,
}: {
  onNavigation: () => void;
  registerGuard: (guard: () => Promise<boolean>) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"open" | "completed">("open");
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
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
        (!(title.trim() || (editing && editTitle !== editing.title)) ||
          (await confirm({
            title: "Discard unfinished task?",
            description:
              "Your task text has not been saved. Stay here to finish it, or discard it before leaving.",
            action: "Discard",
          }))),
    );
    return () => registerGuard(async () => true);
  }, [busy, title, editing, editTitle, registerGuard, confirm]);
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
    change: { title?: string; completed?: boolean },
  ) {
    await mutate(async () => {
      const next = await api<Task>(`tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: task.revision, ...change }),
      });
      setTasks((t) => t.map((item) => (item.id === next.id ? next : item)));
      if (change.title !== undefined) setEditing(null);
    });
  }
  const openCount = tasks.filter((t) => t.completedAt === null).length;
  const visible = tasks.filter(
    (t) =>
      (filter === "completed"
        ? t.completedAt !== null
        : t.completedAt === null) &&
      t.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
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
          disabled={busy || loading}
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
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" disabled={busy || !title.trim()}>
              <Plus size={16} />
              Add task
            </Button>
          </form>
          <div className="tasks-toolbar">
            <div className="task-filters" role="group" aria-label="Task status">
              <Button
                variant="ghost"
                aria-pressed={filter === "open"}
                onClick={() => setFilter("open")}
              >
                Open<span>{openCount}</span>
              </Button>
              <Button
                variant="ghost"
                aria-pressed={filter === "completed"}
                onClick={() => setFilter("completed")}
              >
                Completed<span>{tasks.length - openCount}</span>
              </Button>
            </div>
            <div className="task-search">
              <Search size={15} />
              <Input
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
                disabled={busy}
                onClick={() => void load()}
              >
                Retry
              </Button>
            </div>
          )}
          {loading ? (
            <div
              className="task-skeleton"
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
              aria-label={`${filter === "open" ? "Open" : "Completed"} tasks`}
            >
              {visible.map((task) => (
                <li
                  key={task.id}
                  className={`task-row ${task.completedAt !== null ? "is-complete" : ""}`}
                >
                  <div className="task-check">
                    <Checkbox
                      checked={task.completedAt !== null}
                      disabled={busy}
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
                          void update(task, { title: editTitle.trim() });
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
                      <div>
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
                    <span className="task-title">{task.title}</span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${task.title}`}
                        disabled={busy}
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(task);
                          setEditTitle(task.title);
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
                    : tasks.length
                      ? "Everything is checked off."
                      : "Make room for your next step."}
              </h3>
              <p>
                {query
                  ? "Try another search."
                  : filter === "completed"
                    ? "Check off an open task to keep track of your progress."
                    : "Add a task above. Check it off when you’re done."}
              </p>
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
