"use client";
import { useCompletion } from "@/lib/completion-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark as BookmarkIcon,
  ExternalLink,
  Globe,
  Loader2,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  FileText,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import type { Bookmark, Page } from "@/lib/types";
import { sectionCache } from "@/lib/section-cache";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useConfirm } from "./confirm-provider";
import { NotePicker } from "./note-picker";
import type { CapturedItem } from "./quick-capture";
function PreviewImage({
  src,
  kind,
}: {
  src: string;
  kind: "icon" | "thumbnail";
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Globe size={kind === "icon" ? 16 : 28} strokeWidth={1.5} />
  ) : (
    // Saved previews are authenticated local images, not remote website requests.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}
type BookmarkSummary = { total: number; collections: string[] };
type BookmarkList = {
  items: Bookmark[];
  next: string | null;
  total: number | null;
};
const scopeOf = (favorites: boolean, collection: string) =>
  `${favorites}|${collection}`;
const listKey = (scope: string) => `bookmarks:list:${scope}`;
export async function prefetchBookmarks() {
  const key = listKey(scopeOf(false, "all"));
  if (sectionCache.get(key)) return;
  const [first, counts] = await Promise.all([
    api<Page<Bookmark>>(`bookmarks?${bookmarkParams("", false, "all")}`),
    api<BookmarkSummary>(`bookmarks?${bookmarkParams("", false, "all", true)}`),
  ]);
  sectionCache.set(key, {
    items: first.items,
    next: first.next,
    total: counts.total,
  });
  sectionCache.set("bookmarks:collections", counts.collections);
}
const bookmarkParams = (
  query: string,
  favorites: boolean,
  collection: string,
  summary = false,
) =>
  new URLSearchParams({
    ...(summary ? { summary: "1" } : { limit: "60" }),
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(favorites ? { favorite: "1" } : {}),
    ...(collection === "unfiled"
      ? { unfiled: "1" }
      : collection !== "all"
        ? { collection: collection.slice(2) }
        : {}),
  });
const compareBookmarks = (a: Bookmark, b: Bookmark) =>
  b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function mergeBookmarks(items: Bookmark[], incoming: Bookmark[]) {
  const replaced = new Set(incoming.map((item) => item.id));
  return [...items.filter((item) => !replaced.has(item.id)), ...incoming].sort(
    compareBookmarks,
  );
}
export function BookmarksPanel({
  onNavigation,
  registerGuard,
  initialQuery = "",
  focusCreate = false,
  onOpenNote,
}: {
  onNavigation: () => void;
  registerGuard: (guard: () => Promise<boolean>) => void;
  initialQuery?: string;
  focusCreate?: boolean;
  onOpenNote: (id: string) => Promise<boolean>;
}) {
  const warm = sectionCache.get<BookmarkList>(listKey(scopeOf(false, "all")));
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(warm?.items ?? []);
  const [next, setNext] = useState<string | null>(warm?.next ?? null);
  const [listScope, setListScope] = useState(warm ? scopeOf(false, "all") : "");
  const [total, setTotal] = useState<number | null>(warm?.total ?? null);
  const [collections, setCollections] = useState<string[]>(
    () => sectionCache.get<string[]>("bookmarks:collections") ?? [],
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [url, setUrl] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [collection, setCollection] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [loading, setLoading] = useState(!warm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const unfiltered = !query.trim() && !favorites && collection === "all";
  const invalidate = () => sectionCache.clear("bookmarks:list:", "overview");
  const refreshSummary = useCallback(async () => {
    try {
      const counts = await api<BookmarkSummary>(
        `bookmarks?${bookmarkParams(query, favorites, collection, true)}`,
      );
      setTotal(counts.total);
      setCollections(counts.collections);
    } catch {}
  }, [query, favorites, collection]);
  useEffect(() => {
    const received = (event: Event) => {
      const result = (event as CustomEvent<CapturedItem>).detail;
      if (result.type !== "bookmark") return;
      void refreshSummary();
      if (unfiltered)
        setBookmarks((items) => mergeBookmarks(items, [result.item]));
    };
    window.addEventListener("nivra:captured", received);
    return () => window.removeEventListener("nivra:captured", received);
  }, [unfiltered, refreshSummary]);
  useEffect(() => {
    if (focusCreate) input.current?.focus();
  }, [focusCreate]);
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (busy || url.trim() || newCollection.trim() || editing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("beforeunload", leaving);
    };
  }, [busy, url, newCollection, editing]);
  const view = `${query}\n${favorites}\n${collection}`;
  const currentView = useRef(view);
  const loadVersion = useRef(0);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++loadVersion.current;
      currentView.current = view;
      setLoading(true);
      try {
        const [first, counts] = await Promise.all([
          api<Page<Bookmark>>(
            `bookmarks?${bookmarkParams(query, favorites, collection)}`,
            { signal },
          ),
          api<BookmarkSummary>(
            `bookmarks?${bookmarkParams(query, favorites, collection, true)}`,
            { signal },
          ),
        ]);
        if (signal?.aborted || version !== loadVersion.current) return;
        setBookmarks(first.items);
        setNext(first.next);
        setListScope(scopeOf(favorites, collection));
        setTotal(counts.total);
        setCollections(counts.collections);
        setError("");
      } catch (e) {
        if (!signal?.aborted && version === loadVersion.current)
          setError((e as Error).message);
      } finally {
        if (!signal?.aborted && version === loadVersion.current)
          setLoading(false);
      }
    },
    [query, favorites, collection, view],
  );
  useCompletion("bookmark", () => {
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
    if (
      listScope === scopeOf(favorites, collection) &&
      !query.trim() &&
      !loading
    )
      sectionCache.set(listKey(listScope), { items: bookmarks, next, total });
    sectionCache.set("bookmarks:collections", collections);
  }, [
    bookmarks,
    next,
    total,
    collections,
    listScope,
    favorites,
    collection,
    query,
    loading,
  ]);
  async function loadMore() {
    if (!next || loadingMore) return;
    const started = view;
    setLoadingMore(true);
    try {
      const more = await api<Page<Bookmark>>(
        `bookmarks?${bookmarkParams(query, favorites, collection)}&after=${encodeURIComponent(next)}`,
      );
      if (currentView.current !== started) return;
      setBookmarks((items) => mergeBookmarks(items, more.items));
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
        (!(url.trim() || newCollection.trim() || editing) ||
          (await confirm({
            title: "Discard unfinished bookmark?",
            description:
              "Your link or changes have not been saved. Stay here to finish, or discard them before leaving.",
            action: "Discard",
          }))),
    );
    return () => registerGuard(async () => true);
  }, [busy, url, newCollection, editing, confirm, registerGuard]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
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
    if (!url.trim() || busy) return;
    await mutate(async () => {
      const saved = await api<Bookmark>("bookmarks", {
        method: "POST",
        body: JSON.stringify({
          url: url.trim(),
          collection: newCollection.trim(),
        }),
      });
      invalidate();
      setBookmarks((list) => mergeBookmarks(list, [saved]));
      void refreshSummary();
      setUrl("");
      setNewCollection("");
      setQuery("");
      setCollection("all");
      setFavorites(false);
      input.current?.focus();
      setNotice(
        saved.metadataStatus === "pending"
          ? "Link saved. Fetching its preview in the background."
          : saved.metadataStatus === "ready"
            ? "Bookmark saved."
            : "Link saved. This site’s preview could not be fetched; you can edit its details or retry from the card menu.",
      );
    });
  }
  async function update(
    item: Bookmark,
    changes: Partial<
      Pick<
        Bookmark,
        "title" | "description" | "collection" | "favorite" | "noteId"
      >
    >,
  ) {
    await mutate(async () => {
      const updated = await api<Bookmark>(`bookmarks/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: item.revision, ...changes }),
      });
      invalidate();
      setBookmarks((list) => mergeBookmarks(list, [updated]));
      if (query.trim()) await load();
      else void refreshSummary();
      if (changes.title !== undefined) setEditing(null);
    });
  }
  const scope = scopeOf(favorites, collection);
  const cached = query.trim()
    ? undefined
    : sectionCache.get<BookmarkList>(listKey(scope));
  const ready = listScope === scope;
  const rows = ready ? bookmarks : cached?.items;
  const hasMore = ready ? next !== null : !!cached?.next;
  const shownTotal = ready ? total : (cached?.total ?? null);
  const visible = (rows ?? []).filter(
    (b) =>
      (!favorites || b.favorite) &&
      (collection === "all" ||
        (collection === "unfiled"
          ? !b.collection
          : b.collection === collection.slice(2))),
  );
  return (
    <section className="tasks-panel bookmarks-panel" aria-label="Bookmarks">
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
        <h1>Bookmarks</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh bookmarks"
          disabled={busy || loading || !!editing}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </Button>
      </header>
      <div className="tasks-scroll">
        <div className="bookmarks-content">
          <div className="tasks-intro">
            <h2>Worth coming back to.</h2>
            <p>Keep useful links close, with a little context.</p>
          </div>
          <form className="bookmark-create" onSubmit={add}>
            <div className="bookmark-url">
              <Label htmlFor="bookmark-url">Link</Label>
              <Input
                id="bookmark-url"
                ref={input}
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={url}
                maxLength={4096}
                disabled={busy || !!editing}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <div className="bookmark-collection">
              <Label htmlFor="bookmark-collection">
                Collection <span>(optional)</span>
              </Label>
              <Input
                id="bookmark-collection"
                placeholder="e.g. Reading"
                value={newCollection}
                maxLength={80}
                disabled={busy || !!editing}
                onChange={(e) => setNewCollection(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy || !!editing || !url.trim()}>
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              {busy ? "Saving…" : "Save link"}
            </Button>
          </form>
          {notice && (
            <p className="bookmark-notice" role="status">
              {notice}
            </p>
          )}
          <div className="bookmark-toolbar">
            <div className="bookmark-filters">
              <Button
                variant="ghost"
                aria-pressed={favorites}
                disabled={busy || !!editing}
                onClick={() => setFavorites(!favorites)}
              >
                <Star size={15} fill={favorites ? "currentColor" : "none"} />
                Favorites
              </Button>
              <Select
                value={collection}
                onValueChange={setCollection}
                disabled={busy || !!editing}
              >
                <SelectTrigger aria-label="Filter bookmark collection">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All collections</SelectItem>
                  <SelectItem value="unfiled">Unfiled</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c} value={`c:${c}`}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="task-search">
              <Search size={15} />
              <Input
                disabled={busy || !!editing}
                maxLength={300}
                aria-label="Search bookmarks"
                placeholder="Search links, titles, collections…"
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
            <div
              className="bookmark-grid bookmark-skeleton"
              role="status"
              aria-label="Loading bookmarks"
              aria-busy="true"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span key={n} />
              ))}
            </div>
          ) : visible.length ? (
            <ul
              className="bookmark-grid"
              aria-label="Saved bookmarks"
              aria-busy={loading}
            >
              {visible.map((item) => (
                <li key={item.id} className="bookmark-card">
                  {editing?.id === item.id ? (
                    <form
                      className="bookmark-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void update(item, {
                          title: editing.title.trim(),
                          description: editing.description,
                          collection: editing.collection.trim(),
                          noteId: editing.noteId,
                        });
                      }}
                    >
                      <Label htmlFor={`title-${item.id}`}>Title</Label>
                      <Input
                        id={`title-${item.id}`}
                        autoFocus
                        value={editing.title}
                        maxLength={300}
                        required
                        disabled={busy}
                        onChange={(e) =>
                          setEditing({ ...editing, title: e.target.value })
                        }
                      />
                      <Label htmlFor={`description-${item.id}`}>
                        Description
                      </Label>
                      <Textarea
                        id={`description-${item.id}`}
                        value={editing.description}
                        maxLength={2000}
                        disabled={busy}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            description: e.target.value,
                          })
                        }
                      />
                      <Label htmlFor={`collection-${item.id}`}>
                        Collection
                      </Label>
                      <Input
                        id={`collection-${item.id}`}
                        value={editing.collection}
                        maxLength={80}
                        disabled={busy}
                        onChange={(e) =>
                          setEditing({ ...editing, collection: e.target.value })
                        }
                      />
                      <NotePicker
                        value={editing.noteId}
                        title={editing.noteTitle}
                        disabled={busy}
                        onChange={(id, title) =>
                          setEditing({
                            ...editing,
                            noteId: id,
                            noteTitle: title,
                          })
                        }
                      />
                      <div>
                        <Button
                          type="submit"
                          disabled={busy || !editing.title.trim()}
                        >
                          Save changes
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
                    <>
                      <a
                        className="bookmark-link"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${item.title} in a new tab`}
                      >
                        <div
                          className={`bookmark-preview ${item.thumbnail ? "has-image" : ""}`}
                        >
                          {item.thumbnail ? (
                            <PreviewImage
                              key={item.thumbnail + item.revision}
                              src={item.thumbnail}
                              kind="thumbnail"
                            />
                          ) : (
                            <Globe size={28} strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="bookmark-details">
                          <div className="bookmark-domain">
                            {item.icon ? (
                              <PreviewImage
                                key={item.icon + item.revision}
                                src={item.icon}
                                kind="icon"
                              />
                            ) : (
                              <Globe size={16} />
                            )}
                            <span>
                              {new URL(item.url).hostname.replace(/^www\./, "")}
                            </span>
                            <ExternalLink size={13} />
                          </div>
                          <h3>{item.title}</h3>
                          {item.description && <p>{item.description}</p>}
                          {item.metadataStatus === "pending" && (
                            <p role="status">Fetching preview…</p>
                          )}
                          {item.metadataStatus === "unavailable" && (
                            <p>
                              Preview unavailable. Retry from the card menu.
                            </p>
                          )}
                        </div>
                      </a>
                      <footer className="bookmark-card-footer">
                        <span>{item.collection || "Unfiled"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label={`${item.favorite ? "Unfavorite" : "Favorite"} ${item.title}`}
                          aria-pressed={item.favorite}
                          onClick={() =>
                            void update(item, { favorite: !item.favorite })
                          }
                        >
                          <Star
                            size={16}
                            fill={item.favorite ? "currentColor" : "none"}
                          />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy || !!editing}
                              aria-label={`Actions for ${item.title}`}
                            >
                              <MoreHorizontal size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(item)}>
                              <Pencil size={15} />
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={item.metadataStatus === "pending"}
                              onSelect={() =>
                                void mutate(async () => {
                                  const refreshed = await api<Bookmark>(
                                    `bookmarks/${item.id}/refresh`,
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        revision: item.revision,
                                      }),
                                    },
                                  );
                                  invalidate();
                                  setBookmarks((list) =>
                                    mergeBookmarks(list, [refreshed]),
                                  );
                                })
                              }
                            >
                              <RefreshCw size={15} />
                              Refresh preview
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                void (async () => {
                                  if (
                                    await confirm({
                                      title: "Delete this bookmark?",
                                      description:
                                        "This removes the saved link and its preview from Nivra.",
                                      action: "Delete bookmark",
                                    })
                                  )
                                    await mutate(async () => {
                                      await api(`bookmarks/${item.id}`, {
                                        method: "DELETE",
                                        body: JSON.stringify({
                                          revision: item.revision,
                                        }),
                                      });
                                      invalidate();
                                      setBookmarks((list) =>
                                        list.filter((b) => b.id !== item.id),
                                      );
                                      void refreshSummary();
                                    });
                                })()
                              }
                            >
                              <Trash2 size={15} />
                              Delete bookmark
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </footer>
                      {item.noteId && (
                        <button
                          className="bookmark-note-link linked-note-chip"
                          aria-label={`Open linked note ${item.noteTitle || "Untitled"}`}
                          disabled={busy || !!editing}
                          onClick={() => void onOpenNote(item.noteId!)}
                        >
                          <FileText size={13} />
                          {item.noteTitle || "Untitled"}
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="tasks-empty">
              <BookmarkIcon size={30} strokeWidth={1.5} />
              <h3>
                {query || favorites || collection !== "all"
                  ? "No matching bookmarks."
                  : "A home for your useful links."}
              </h3>
              <p>
                {query || favorites || collection !== "all"
                  ? "Try another search or collection."
                  : "Paste a link above. Nivra will save the details and preview."}
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
                {loadingMore ? "Loading…" : "Load more bookmarks"}
              </Button>
            </div>
          )}
          {rows !== undefined && (
            <p className="task-summary" aria-live="polite">
              {shownTotal === null
                ? "\u00a0"
                : `${shownTotal} ${shownTotal === 1 ? "bookmark" : "bookmarks"}`}
              {busy && <Loader2 size={13} className="animate-spin" />}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
