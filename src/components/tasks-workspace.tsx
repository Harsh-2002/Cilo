"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Columns3,
  List,
  MoreHorizontal,
  Plus,
  Archive,
  ArchiveRestore,
  Pencil,
} from "lucide-react";
import type { Board, BoardDetail, Page } from "@/lib/types";
import type { TaskStage } from "@/lib/boards";
import { taskStages } from "@/lib/boards";
import { api, ApiError } from "@/lib/client";
import { TasksPanel } from "./tasks-panel";
import { KanbanPanel } from "./kanban-panel";
import { BoardPicker } from "./board-picker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useConfirm } from "./confirm-provider";
import { LoadingState } from "./loading-state";

type Props = React.ComponentProps<typeof TasksPanel>;
export function TasksWorkspace(props: Props) {
  const confirm = useConfirm();
  const [routeTask, setRouteTask] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false),
    [view, setView] = useState<"list" | "board">("list"),
    [board, setBoard] = useState<BoardDetail | null>(null),
    [boardId, setBoardId] = useState<string | null>(null),
    [stage, setStage] = useState<TaskStage>("todo"),
    [archived, setArchived] = useState(false),
    [form, setForm] = useState<"new" | "rename" | null>(null),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [boardLoading, setBoardLoading] = useState(false),
    [boardFailed, setBoardFailed] = useState(false),
    [error, setError] = useState("");
  const guard = useRef<() => Promise<boolean>>(async () => true),
    boardRef = useRef(board),
    boardRequest = useRef(0);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  const formRef = useRef({ form, name, busy });
  useEffect(() => {
    formRef.current = { form, name, busy };
  }, [form, name, busy]);
  const canLeave = useCallback(async () => {
    if (formRef.current.busy) return false;
    if (!(await guard.current())) return false;
    if (
      formRef.current.form &&
      formRef.current.name.trim() &&
      !(await confirm({
        title: "Discard board changes?",
        description: "The board name has not been saved.",
        action: "Discard",
      }))
    )
      return false;
    setForm(null);
    setName("");
    return true;
  }, [confirm]);
  const parentRegisterGuard = props.registerGuard;
  const registerGuard = useCallback(
    (next: () => Promise<boolean>) => {
      guard.current = next;
      parentRegisterGuard(canLeave);
    },
    [parentRegisterGuard, canLeave],
  );
  useEffect(() => {
    const read = () => {
      const p = new URL(location.href).searchParams;
      setView(p.get("view") === "board" ? "board" : "list");
      const id = p.get("board");
      setBoardId(id && /^[a-f0-9-]{36}$/i.test(id) ? id : null);
      setRouteTask(p.get("task") ?? undefined);
      const s = p.get("stage");
      setStage(taskStages.includes(s as TaskStage) ? (s as TaskStage) : "todo");
      setReady(true);
    };
    read();
    window.addEventListener("nivra:tasks-route", read);
    window.addEventListener("nivra:tasks-navigation", read);
    return () => {
      window.removeEventListener("nivra:tasks-route", read);
      window.removeEventListener("nivra:tasks-navigation", read);
    };
  }, []);
  const loadBoard = useCallback(
    async (signal?: AbortSignal) => {
      const ticket = ++boardRequest.current;
      if (!boardId) {
        setBoard(null);
        setError("");
        setBoardLoading(false);
        setBoardFailed(false);
        return;
      }
      setBoardLoading(boardRef.current?.id !== boardId);
      setBoardFailed(false);
      try {
        const b = await api<BoardDetail>(`boards/${boardId}`, { signal });
        if (!signal?.aborted && ticket === boardRequest.current) {
          setBoard(b);
          setArchived(b.archivedAt !== null);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted && ticket === boardRequest.current) {
          if (e instanceof ApiError && e.status === 404) {
            setBoard(null);
            setBoardId(null);
            setError("");
            const target = new URL(location.href);
            target.searchParams.delete("board");
            target.searchParams.delete("task");
            history.replaceState({}, "", target);
            window.dispatchEvent(new Event("nivra:tasks-navigation"));
          } else {
            setBoardFailed(true);
            setError((e as Error).message);
          }
        }
      } finally {
        if (!signal?.aborted && ticket === boardRequest.current)
          setBoardLoading(false);
      }
    },
    [boardId],
  );
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => void loadBoard(abort.signal), 0);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [loadBoard]);
  const url = (
    nextView: viewType,
    nextBoard: string | null,
    nextStage: TaskStage,
  ) => {
    const target = new URL(location.href);
    target.searchParams.set("view", nextView);
    if (nextBoard) target.searchParams.set("board", nextBoard);
    else target.searchParams.delete("board");
    if (nextView === "board") target.searchParams.set("stage", nextStage);
    else target.searchParams.delete("stage");
    target.searchParams.delete("task");
    history.pushState({}, "", target);
    window.dispatchEvent(new Event("nivra:tasks-navigation"));
  };
  type viewType = "list" | "board";
  async function choose(
    nextView: viewType,
    nextBoard: Board | null = boardRef.current,
  ) {
    if (!(await canLeave())) return;
    if (nextView === "board" && !nextBoard) {
      try {
        const first = await api<Page<Board>>("boards?limit=1");
        nextBoard = first.items[0] ?? null;
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    setView(nextView);
    setBoardId(nextBoard?.id ?? null);
    setBoard(
      nextBoard
        ? { ...nextBoard, counts: { todo: 0, in_progress: 0, done: 0 } }
        : null,
    );
    url(nextView, nextBoard?.id ?? null, stage);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const b = await api<Board>(
        form === "rename" && board ? `boards/${board.id}` : "boards",
        {
          method: form === "rename" ? "PATCH" : "POST",
          body: JSON.stringify({
            name: name.trim(),
            ...(form === "rename" && board ? { revision: board.revision } : {}),
          }),
        },
      );
      const nextView = form === "rename" ? view : "board";
      setForm(null);
      setName("");
      setArchived(b.archivedAt !== null);
      setView(nextView);
      setBoardId(b.id);
      setBoard({ ...b, counts: { todo: 0, in_progress: 0, done: 0 } });
      url(nextView, b.id, stage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!board || !(await canLeave())) return;
    setBusy(true);
    setError("");
    try {
      const b = await api<Board>(`boards/${board.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: board.revision,
          archived: board.archivedAt === null,
        }),
      });
      setBoard({ ...b, counts: board.counts });
      setArchived(b.archivedAt !== null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const controls = (
    <>
      <div className="tasks-view-toolbar">
        <div className="tasks-view-switch" role="group" aria-label="Tasks view">
          <Button
            variant="ghost"
            aria-pressed={view === "list"}
            onClick={() => void choose("list")}
          >
            <List size={16} />
            List
          </Button>
          <Button
            variant="ghost"
            aria-pressed={view === "board"}
            onClick={() => void choose("board")}
          >
            <Columns3 size={16} />
            Board
          </Button>
        </div>
        <BoardPicker
          value={boardId}
          name={board?.name}
          archived={archived}
          allowAll={view === "list"}
          disabled={busy}
          onChange={(b) => void choose(view, b)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Board options"
              disabled={busy}
            >
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                void canLeave().then((ok) => {
                  if (ok) {
                    setForm("new");
                    setName("");
                  }
                })
              }
            >
              <Plus size={15} />
              New board
            </DropdownMenuItem>
            {board && (
              <DropdownMenuItem
                onSelect={() => {
                  setForm("rename");
                  setName(board.name);
                }}
              >
                <Pencil size={15} />
                Rename board
              </DropdownMenuItem>
            )}
            {board && (
              <DropdownMenuItem onSelect={() => void archive()}>
                {board.archivedAt === null ? (
                  <Archive size={15} />
                ) : (
                  <ArchiveRestore size={15} />
                )}{" "}
                {board.archivedAt === null ? "Archive board" : "Reopen board"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setArchived(!archived)}>
              {archived ? "Active boards" : "Archived boards"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {board?.archivedAt !== null && board && (
          <span className="board-archived-label">Archived</span>
        )}
      </div>
      {form && (
        <form className="board-name-form" onSubmit={(e) => void save(e)}>
          <div>
            <Label htmlFor="board-name">
              {form === "new" ? "New board" : "Board name"}
            </Label>
            <Input
              id="board-name"
              autoFocus
              placeholder="e.g. Website project"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : form === "new" ? "Create board" : "Save name"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setForm(null);
              setName("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}
      {error && (
        <p className="tasks-error" role="alert">
          <span>{error}</span>
          {boardFailed && (
            <Button variant="outline" onClick={() => void loadBoard()}>
              Retry
            </Button>
          )}
        </p>
      )}
    </>
  );
  if (!ready) return <LoadingState kind="tasks" label="Loading tasks" />;
  return view === "list" ? (
    <TasksPanel
      {...props}
      key={`list:${boardId ?? "all"}`}
      boardId={boardId ?? undefined}
      creationDisabled={!!board && board.archivedAt !== null}
      initialTaskId={routeTask ?? props.initialTaskId}
      controls={controls}
      registerGuard={registerGuard}
    />
  ) : (
    <KanbanPanel
      key={boardId ?? "empty"}
      board={board?.id === boardId ? board : null}
      boardLoading={
        !!boardId && board?.id !== boardId && (boardLoading || !boardFailed)
      }
      hideEmpty={!!form || boardFailed}
      controls={controls}
      stage={stage}
      onStage={(s) => {
        setStage(s);
        url(view, boardId, s);
      }}
      onNavigation={props.onNavigation}
      registerGuard={registerGuard}
      onOpenNote={props.onOpenNote}
      initialTaskId={routeTask ?? props.initialTaskId}
      onBoardChanged={() => void loadBoard()}
      onNewBoard={() => {
        setForm("new");
        setName("");
      }}
    />
  );
}
