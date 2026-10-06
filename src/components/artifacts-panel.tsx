"use client";
import { useCompletion } from "@/lib/completion-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  Copy,
  Download,
  File as FileIcon,
  FileAudio,
  FileVideo,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Menu,
  MoreHorizontal,
  RefreshCw,
  ScanText,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import {
  fromClipboard,
  fromTransfer,
  makeThumbnail,
  readableSize,
  type Dropped,
} from "@/lib/artifacts-client";
import { sectionCache } from "@/lib/section-cache";
import type { Artifact, ArtifactDetail, Page } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SearchText } from "./search-text";
import { ArtifactViewer, artifactLabel, copyText } from "./artifact-viewer";
import { useConfirm } from "./confirm-provider";
import { shortcutParts, useIsApple } from "@/lib/shortcuts";

type Kind = "all" | "image" | "text" | "file";
type Summary = { total: number; images: number; texts: number; files: number };
type List = { items: Artifact[]; next: string | null };
type Job = { id: string; label: string; source: Dropped; error?: string };
const listKey = (kind: Kind) => `artifacts:list:${kind}`;
const params = (query: string, kind: Kind, summary = false) =>
  new URLSearchParams({
    ...(summary ? { summary: "1" } : { limit: "60" }),
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(kind !== "all" && !summary ? { kind } : {}),
  });
const compare = (a: Artifact, b: Artifact) =>
  b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function merge(items: Artifact[], incoming: Artifact[]) {
  const replaced = new Set(incoming.map((item) => item.id));
  return [...items.filter((item) => !replaced.has(item.id)), ...incoming].sort(
    compare,
  );
}
const withoutContent = (detail: ArtifactDetail | Artifact): Artifact => {
  const copy = { ...detail } as Partial<ArtifactDetail>;
  delete copy.content;
  return copy as Artifact;
};
export async function prefetchArtifacts() {
  if (sectionCache.get(listKey("all"))) return;
  const [first, summary] = await Promise.all([
    api<Page<Artifact>>(`artifacts?${params("", "all")}`),
    api<Summary>(`artifacts?${params("", "all", true)}`),
  ]);
  sectionCache.set(listKey("all"), { items: first.items, next: first.next });
  sectionCache.set("artifacts:summary", summary);
}
const typeIcon = (item: Artifact) =>
  item.kind === "image"
    ? ImageIcon
    : item.kind === "text"
      ? FileText
      : item.mime.startsWith("audio/")
        ? FileAudio
        : item.mime.startsWith("video/")
          ? FileVideo
          : FileIcon;

export function ArtifactsPanel({
  onNavigation,
  registerGuard,
  initialQuery = "",
  openId = null,
}: {
  onNavigation: () => void;
  registerGuard: (guard: () => Promise<boolean>) => void;
  initialQuery?: string;
  openId?: string | null;
}) {
  const apple = useIsApple();
  const confirm = useConfirm();
  const warm = sectionCache.get<List>(listKey("all"));
  const [items, setItems] = useState<Artifact[]>(warm?.items ?? []);
  const [next, setNext] = useState<string | null>(warm?.next ?? null);
  const [listKind, setListKind] = useState<Kind | "">(warm ? "all" : "");
  const [summary, setSummary] = useState<Summary | null>(
    () => sectionCache.get<Summary>("artifacts:summary") ?? null,
  );
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<Kind>("all");
  const [loading, setLoading] = useState(!warm);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [composer, setComposer] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<string | null>(openId);
  const [notice, setNotice] = useState("");
  const chain = useRef(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  const view = `${kind}\n${query}`;
  const currentView = useRef(view);
  const loadVersion = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++loadVersion.current;
      currentView.current = view;
      setLoading(true);
      try {
        const [first, counts] = await Promise.all([
          api<Page<Artifact>>(`artifacts?${params(query, kind)}`, { signal }),
          api<Summary>(`artifacts?${params("", "all", true)}`, { signal }),
        ]);
        if (signal?.aborted || version !== loadVersion.current) return;
        setItems(first.items);
        setNext(first.next);
        setListKind(kind);
        setSummary(counts);
        setError("");
      } catch (e) {
        if (!signal?.aborted && version === loadVersion.current)
          setError((e as Error).message);
      } finally {
        if (!signal?.aborted && version === loadVersion.current)
          setLoading(false);
      }
    },
    [kind, query, view],
  );
  useCompletion("artifact", () => {
    void load();
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
    if (listKind === kind && !query.trim() && !loading)
      sectionCache.set(listKey(kind), { items, next });
    if (summary) sectionCache.set("artifacts:summary", summary);
  }, [items, next, summary, listKind, kind, query, loading]);
  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await api<Summary>(`artifacts?${params("", "all", true)}`));
    } catch {}
  }, []);
  async function loadMore() {
    if (!next || loadingMore) return;
    const started = view;
    setLoadingMore(true);
    try {
      const more = await api<Page<Artifact>>(
        `artifacts?${params(query, kind)}&after=${encodeURIComponent(next)}`,
      );
      if (currentView.current !== started) return;
      setItems((list) => merge(list, more.items));
      setNext(more.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  const invalidate = () => sectionCache.clear("artifacts:list:", "overview");

  async function send(source: Dropped) {
    if (typeof source === "string")
      return api<Artifact>("artifacts", {
        method: "POST",
        body: JSON.stringify({ text: source }),
      });
    const form = new FormData();
    form.set("file", source);
    const thumbnail = await makeThumbnail(source);
    if (thumbnail) form.set("thumb", thumbnail, "thumbnail");
    return api<Artifact>("artifacts", { method: "POST", body: form });
  }
  function save(sources: Dropped[]) {
    for (const source of sources) {
      const job: Job = {
        id: crypto.randomUUID(),
        label: typeof source === "string" ? "Text" : source.name || "File",
        source,
      };
      setJobs((list) => [...list, job]);
      chain.current = chain.current.then(() => run(job));
    }
  }
  async function run(job: Job) {
    try {
      const saved = await send(job.source);
      invalidate();
      setJobs((list) => list.filter((entry) => entry.id !== job.id));
      if (kind === "all" || kind === saved.kind)
        setItems((list) => merge(list, [saved]));
      void refreshSummary();
      setNotice(`Saved ${job.label}.`);
      setTimeout(() => setNotice(""), 3500);
    } catch (e) {
      setJobs((list) =>
        list.map((entry) =>
          entry.id === job.id
            ? { ...entry, error: (e as Error).message }
            : entry,
        ),
      );
    }
  }
  // Paste works anywhere on this page unless the person is typing in a field.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable='true']"))
        return;
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      const sources = fromTransfer(event.clipboardData);
      if (!sources.length) return;
      event.preventDefault();
      save(sources);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });
  async function pasteButton() {
    try {
      const sources = await fromClipboard();
      if (!sources.length)
        return toast.message("The clipboard has no text or image to save.");
      save(sources);
    } catch {
      toast.error(
        "Your browser did not allow clipboard access. Use the keyboard shortcut, Upload or Add text.",
      );
    }
  }
  useEffect(() => {
    registerGuard(
      async () =>
        (!composer?.trim() && jobs.length === 0) ||
        (await confirm({
          title: "Leave without saving?",
          description: "Something here has not finished saving yet.",
          action: "Leave",
        })),
    );
    return () => registerGuard(async () => true);
  }, [composer, jobs, confirm, registerGuard]);
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (composer?.trim() || jobs.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  }, [composer, jobs]);
  async function remove(item: Artifact) {
    if (
      !(await confirm({
        title: "Delete this artifact?",
        description:
          "It is removed from Nivra, along with any text read from it.",
        action: "Delete artifact",
      }))
    )
      return;
    try {
      await api(`artifacts/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ revision: item.revision }),
      });
      removed(item.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function removed(id: string) {
    invalidate();
    setItems((list) => list.filter((item) => item.id !== id));
    void refreshSummary();
  }
  const changed = useCallback((item: Artifact) => {
    invalidate();
    setItems((list) =>
      list.map((entry) =>
        entry.id === item.id ? withoutContent(item) : entry,
      ),
    );
  }, []);
  async function copyOf(item: Artifact) {
    try {
      await copyText(
        (await api<ArtifactDetail>(`artifacts/${item.id}`)).content,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const cached = query.trim()
    ? undefined
    : sectionCache.get<List>(listKey(kind));
  const ready = listKind === kind;
  const rows = ready ? items : cached?.items;
  const hasMore = ready ? next !== null : !!cached?.next;
  const visible = (rows ?? []).filter(
    (item) => kind === "all" || item.kind === kind,
  );
  const shortcut = shortcutParts({ key: "V", code: "KeyV" }, apple).join(
    apple ? " " : "+",
  );
  const chips: [Kind, string, number | undefined][] = [
    ["all", "All", summary?.total],
    ["image", "Images", summary?.images],
    ["text", "Text", summary?.texts],
    ["file", "Files", summary?.files],
  ];
  return (
    <section
      className={`tasks-panel artifacts-panel ${dragging ? "is-dragging" : ""}`}
      aria-label="Artifacts"
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.some(
            (type) => type === "Files" || type === "text/plain",
          )
        ) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        save(fromTransfer(e.dataTransfer));
      }}
    >
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
        <h1>Artifacts</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh artifacts"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </Button>
      </header>
      <div className="tasks-scroll">
        <div className="artifacts-content">
          <div className="tasks-intro">
            <h2>Save it for later.</h2>
            <p>Screenshots, text and files, ready to find again.</p>
          </div>
          <div
            className="artifact-drop"
            role="group"
            aria-label="Add to artifacts"
          >
            <p>
              Drop files here or paste with <kbd>{shortcut}</kbd>.
            </p>
            <div className="artifact-drop-actions">
              <Button variant="outline" onClick={() => void pasteButton()}>
                <ClipboardPaste size={15} />
                Paste
              </Button>
              <Button
                variant="default"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} />
                Upload
              </Button>
              <Button
                variant="outline"
                onClick={() => setComposer(composer ?? "")}
              >
                <FileText size={15} />
                Add text
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                save([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
          {composer !== null && (
            <form
              className="artifact-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (!composer.trim()) return;
                save([composer]);
                setComposer(null);
              }}
            >
              <Textarea
                autoFocus
                aria-label="Text to save"
                placeholder="Type or paste anything…"
                value={composer}
                maxLength={200000}
                onChange={(e) => setComposer(e.target.value)}
              />
              <div>
                <Button type="submit" disabled={!composer.trim()}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setComposer(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {jobs.length > 0 && (
            <ul className="artifact-jobs" aria-label="Saving">
              {jobs.map((job) => (
                <li key={job.id} className={job.error ? "has-error" : ""}>
                  {job.error ? (
                    <X size={14} />
                  ) : (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  <span>{job.label}</span>
                  <em role={job.error ? "alert" : undefined}>
                    {job.error || "Saving…"}
                  </em>
                  {job.error && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setJobs((list) =>
                            list.map((entry) =>
                              entry.id === job.id
                                ? { ...entry, error: undefined }
                                : entry,
                            ),
                          );
                          chain.current = chain.current.then(() => run(job));
                        }}
                      >
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Dismiss ${job.label}`}
                        onClick={() =>
                          setJobs((list) =>
                            list.filter((entry) => entry.id !== job.id),
                          )
                        }
                      >
                        <X size={14} />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="tasks-toolbar artifact-toolbar">
            <div
              className="task-filters artifact-filters"
              role="group"
              aria-label="Artifact type"
            >
              {chips.map(([id, label, count]) => (
                <Button
                  key={id}
                  variant="ghost"
                  aria-pressed={kind === id}
                  onClick={() => setKind(id)}
                >
                  {label}
                  <span>{count}</span>
                </Button>
              ))}
            </div>
            <div className="artifact-type-select">
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as Kind)}
              >
                <SelectTrigger aria-label="Artifact type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chips.map(([id, label, count]) => (
                    <SelectItem key={id} value={id}>
                      {label} · {count ?? "…"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="task-search">
              <Search size={15} aria-hidden="true" />
              <Input
                aria-label="Search artifacts"
                placeholder="Search artifacts…"
                value={query}
                maxLength={300}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <div className="tasks-error" role="alert">
              <p>{error}</p>
              <Button variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}
          {rows === undefined && !error ? (
            <div
              className="artifact-grid artifact-skeleton"
              role="status"
              aria-label="Loading artifacts"
              aria-busy="true"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span key={n} />
              ))}
            </div>
          ) : visible.length ? (
            <ul
              className="artifact-grid"
              aria-label="Saved artifacts"
              aria-busy={loading}
            >
              {visible.map((item) => {
                const Icon = typeIcon(item);
                const source = item.thumbnail ? "thumbnail" : "file";
                return (
                  <li key={item.id} className={`artifact-card is-${item.kind}`}>
                    <button
                      className="artifact-open"
                      onClick={() => setViewing(item.id)}
                      aria-label={`Open ${artifactLabel(item)}`}
                    >
                      {(item.kind === "image" || item.thumbnail) && (
                        <span className="artifact-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/nivra/artifacts/${item.id}/${source}`}
                            alt=""
                            loading="lazy"
                          />
                        </span>
                      )}
                      {item.kind === "file" && !item.thumbnail && (
                        <span className="artifact-file">
                          <Icon size={28} strokeWidth={1.4} />
                          <small>{item.mime || "File"}</small>
                        </span>
                      )}
                      <span className="artifact-details">
                        <strong className="artifact-card-title">
                          {artifactLabel(item)}
                        </strong>
                        {item.name && item.name !== artifactLabel(item) && (
                          <span
                            className="artifact-card-name"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        )}
                        {item.excerpt !== undefined ? (
                          <span className="artifact-hit">
                            <ScanText size={13} aria-hidden="true" />
                            <SearchText
                              text={item.excerpt}
                              ranges={item.excerptMatches}
                            />
                          </span>
                        ) : item.preview ? (
                          <span className="artifact-snippet">
                            {item.preview}
                          </span>
                        ) : null}
                        {item.extraction === "pending" && (
                          <span className="artifact-status" role="status">
                            <Loader2 size={12} className="animate-spin" />
                            Reading text…
                          </span>
                        )}
                        {item.extraction === "failed" && (
                          <span className="artifact-status">
                            Text extraction failed. Open to retry.
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="artifact-card-footer">
                      <span>
                        {item.kind === "text"
                          ? "Text"
                          : readableSize(item.size)}{" "}
                        ·{" "}
                        {new Date(item.createdAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="artifact-menu"
                            aria-label={`Actions for ${artifactLabel(item)}`}
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setViewing(item.id)}
                          >
                            <Search size={15} />
                            Open
                          </DropdownMenuItem>
                          {(item.kind === "text" || item.preview) && (
                            <DropdownMenuItem
                              onSelect={() => void copyOf(item)}
                            >
                              <Copy size={15} />
                              Copy text
                            </DropdownMenuItem>
                          )}
                          {item.kind !== "text" && (
                            <DropdownMenuItem asChild>
                              <a
                                href={`/api/nivra/artifacts/${item.id}/file`}
                                download={item.name}
                              >
                                <Download size={15} />
                                Download
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => void remove(item)}>
                            <Trash2 size={15} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="tasks-empty">
              {query ? (
                <Search size={28} strokeWidth={1.5} />
              ) : (
                <Layers size={30} strokeWidth={1.5} />
              )}
              <h3>{query ? "No matches." : "Nothing saved yet."}</h3>
              <p>
                {query
                  ? "Text inside images is searched once it has been read. Try another word."
                  : "Paste a screenshot or drop a file to start your collection."}
              </p>
            </div>
          )}
          {hasMore && rows !== undefined && (
            <div className="list-continuation">
              <Button
                variant="ghost"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Loading…" : "Load more artifacts"}
              </Button>
            </div>
          )}
          <p className="task-summary" aria-live="polite">
            {notice || " "}
          </p>
        </div>
      </div>
      <ArtifactViewer
        id={viewing}
        onClose={() => setViewing(null)}
        onChange={changed}
        onDeleted={removed}
      />
    </section>
  );
}
