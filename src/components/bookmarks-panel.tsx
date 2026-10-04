"use client";
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
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import type { Bookmark } from "@/lib/types";
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
export function BookmarksPanel({
  onNavigation,
  registerGuard,
}: {
  onNavigation: () => void;
  registerGuard: (guard: () => Promise<boolean>) => void;
}) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [results, setResults] = useState<Bookmark[] | null>(null);
  const [url, setUrl] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchError, setSearchError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    const leaving = (e: BeforeUnloadEvent) => {
      if (busy || url.trim() || newCollection.trim() || editing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [busy, url, newCollection, editing]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBookmarks(await api<Bookmark[]>("bookmarks"));
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
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchError("");
      if (!query.trim()) {
        setResults(null);
        return;
      }
      void api<Bookmark[]>(`bookmarks?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((list) => {
          if (active) setResults(list);
        })
        .catch((e) => {
          if (active) setSearchError((e as Error).message);
        });
    }, 180);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, bookmarks]);
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
      if (e instanceof ApiError && e.status === 409)
        setBookmarks(await api<Bookmark[]>("bookmarks").catch(() => bookmarks));
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    await mutate(async () => {
      const next = await api<Bookmark>("bookmarks", {
        method: "POST",
        body: JSON.stringify({
          url: url.trim(),
          collection: newCollection.trim(),
        }),
      });
      setBookmarks((list) => [next, ...list]);
      setUrl("");
      setNewCollection("");
      setQuery("");
      setCollection("all");
      setFavorites(false);
      input.current?.focus();
      setNotice(
        next.metadataStatus === "ready"
          ? "Bookmark saved."
          : "Link saved. This site’s preview could not be fetched; you can edit its details or retry from the card menu.",
      );
    });
  }
  async function update(
    item: Bookmark,
    changes: Partial<
      Pick<Bookmark, "title" | "description" | "collection" | "favorite">
    >,
  ) {
    await mutate(async () => {
      const next = await api<Bookmark>(`bookmarks/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: item.revision, ...changes }),
      });
      setBookmarks((list) => list.map((b) => (b.id === next.id ? next : b)));
      if (changes.title !== undefined) setEditing(null);
    });
  }
  const collections = [
    ...new Set(bookmarks.map((b) => b.collection).filter(Boolean)),
  ].sort();
  const visible = (query.trim() ? results || [] : bookmarks).filter(
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
                ref={searchInput}
                disabled={busy || !!editing}
                maxLength={300}
                aria-label="Search bookmarks"
                placeholder="Search links, titles, collections…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {(error || searchError) && (
            <div className="tasks-error" role="alert">
              <p>{error || searchError}</p>
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
              aria-label="Loading bookmarks"
              aria-busy="true"
            >
              <span />
              <span />
              <span />
            </div>
          ) : visible.length ? (
            <ul className="bookmark-grid" aria-label="Saved bookmarks">
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
                              onSelect={() =>
                                void mutate(async () => {
                                  const next = await api<Bookmark>(
                                    `bookmarks/${item.id}/refresh`,
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        revision: item.revision,
                                      }),
                                    },
                                  );
                                  setBookmarks((list) =>
                                    list.map((b) =>
                                      b.id === next.id ? next : b,
                                    ),
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
                                        "This removes the saved link and its preview from Cilo.",
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
                                      setBookmarks((list) =>
                                        list.filter((b) => b.id !== item.id),
                                      );
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
                  : "Paste a link above. Cilo will save the details and preview."}
              </p>
            </div>
          )}
          <p className="task-summary" aria-live="polite">
            {visible.length} {visible.length === 1 ? "bookmark" : "bookmarks"}
            {busy && <Loader2 size={13} className="animate-spin" />}
          </p>
        </div>
      </div>
    </section>
  );
}
