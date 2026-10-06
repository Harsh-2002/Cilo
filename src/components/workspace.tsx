"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Star,
  Trash2,
  Search,
  Plus,
  SlidersHorizontal as SettingsIcon,
  PanelLeftClose,
  Menu,
  MoreHorizontal,
  Pencil,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  ArrowRight,
  Grid2X2,
  Heart,
  NotebookPen,
  StickyNote,
  SquareCheckBig,
  LibraryBig,
  Layers,
  Trash,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Mark } from "./auth-screen";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { api, authRequest } from "@/lib/client";
import type {
  Note,
  NoteSummary,
  Owner,
  Settings,
  Tag,
  SearchResult,
} from "@/lib/types";
import { localDate } from "@/lib/dates";
import { GlobalSearch, type SearchHandle } from "./global-search";
import {
  QuickCapture,
  type CaptureHandle,
  type CapturedItem,
} from "./quick-capture";
import { NotePane } from "./note-pane";
import { useConfirm } from "./confirm-provider";
import { TagColorPicker } from "./tag-color-picker";
import type { TagColor } from "@/lib/tags";
import { SettingsPanel } from "./settings-panel";
import { BookmarksPanel, prefetchBookmarks } from "./bookmarks-panel";
import { OverviewPanel, prefetchOverview } from "./overview-panel";
import { TasksPanel, prefetchTasks } from "./tasks-panel";
import { ArtifactsPanel, prefetchArtifacts } from "./artifacts-panel";
import { useCompletionStream } from "@/lib/completion-client";
import { sectionCache } from "@/lib/section-cache";
import { matches, shortcuts } from "@/lib/shortcuts";
import { Shortcut, ShortcutKeys } from "./shortcut";

export function Workspace({
  owner,
  initialSettings,
  onSignOut,
}: {
  owner: Owner;
  initialSettings: Settings;
  onSignOut: () => void;
}) {
  useCompletionStream(onSignOut);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [focusTerms, setFocusTerms] = useState<string[]>([]);
  const [view, setView] = useState("overview");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [listScope, setListScope] = useState("");
  const loadedNotes = useRef<NoteSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const globalSearch = useRef<SearchHandle>(null);
  const capture = useRef<CaptureHandle>(null);
  const captured = (result: CapturedItem) => {
    if (result.type === "note") void load();
    window.dispatchEvent(new CustomEvent("nivra:captured", { detail: result }));
  };
  const [sectionTarget, setSectionTarget] = useState<{
    query: string;
    completed?: boolean;
    focusCreate?: boolean;
    openId?: string;
  }>({ query: "" });
  const initialLink = useRef(false);
  const [tagDialog, setTagDialog] = useState<{
    id?: string;
    name: string;
    color?: TagColor;
  } | null>(null);
  const [tagBusy, setTagBusy] = useState(false);
  const confirm = useConfirm();
  const [generation, setGeneration] = useState(0);
  const guard = useRef<() => Promise<boolean>>(async () => true);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const registerGuard = useCallback((value: () => Promise<boolean>) => {
    guard.current = value;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(async () => {
    await Promise.resolve();
    const seq = ++loadSequence.current;
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view,
        sort,
        q: search,
        limit: "61",
        preview: "1",
        ...(tag ? { tag } : {}),
      });
      const [list, allTags] = await Promise.all([
        api<NoteSummary[]>(`notes?${params}`),
        api<Tag[]>("tags"),
      ]);
      if (seq === loadSequence.current) {
        const loaded = list.slice(0, 60);
        loadedNotes.current = loaded;
        setNotes(loaded);
        setListScope(`${view}|${tag}`);
        setHasMore(list.length > 60);
        setMoreError("");
        setLoadingMore(false);
        setTags(allTags);
      }
    } catch (e) {
      if (seq === loadSequence.current) setError((e as Error).message);
    } finally {
      if (seq === loadSequence.current) setLoading(false);
    }
  }, [view, tag, search, sort]);
  const loadMore = async () => {
    if (loadingMore || loading || !hasMore || listScope !== `${view}|${tag}`)
      return;
    const seq = loadSequence.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const params = new URLSearchParams({
        view,
        sort,
        q: search,
        limit: "61",
        preview: "1",
        offset: String(notes.length),
        ...(tag ? { tag } : {}),
      });
      const list = await api<NoteSummary[]>(`notes?${params}`);
      if (seq !== loadSequence.current) return;
      setNotes((previous) => [
        ...previous,
        ...list
          .slice(0, 60)
          .filter((note) => !previous.some((item) => item.id === note.id)),
      ]);
      setHasMore(list.length > 60);
    } catch (e) {
      if (seq === loadSequence.current) setMoreError((e as Error).message);
    } finally {
      if (seq === loadSequence.current) setLoadingMore(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (listScope !== `${view}|${tag}` || search || loading) return;
    // A list that no longer matches the last server copy was edited locally, so other cached sections are stale.
    if (notes !== loadedNotes.current) sectionCache.clear("notes:", "overview");
    sectionCache.set(`notes:${listScope}|${sort}`, { notes, hasMore });
  }, [notes, hasMore, listScope, view, tag, search, sort, loading]);
  useEffect(() => () => sectionCache.clear(), []);
  useEffect(() => {
    const warm = () =>
      void Promise.allSettled([
        prefetchOverview(),
        prefetchTasks(),
        prefetchBookmarks(),
        prefetchArtifacts(),
        ...["all", "favorites", "journal", "trash"].map(async (name) => {
          const key = `notes:${name}||updated`;
          if (sectionCache.get(key)) return;
          const list = await api<NoteSummary[]>(
            `notes?${new URLSearchParams({ view: name, sort: "updated", q: "", limit: "61", preview: "1" })}`,
          );
          if (!sectionCache.get(key))
            sectionCache.set(key, {
              notes: list.slice(0, 60),
              hasMore: list.length > 60,
            });
        }),
      ]);
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 3000 })
      : window.setTimeout(warm, 1200);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);
  const onSaved = useCallback((note: Note) => {
    setNotes((previous) =>
      previous.map((n) => (n.id === note.id ? { ...n, ...note } : n)),
    );
  }, []);
  async function open(note: NoteSummary) {
    if (active?.id === note.id) return;
    if (!(await guard.current())) {
      toast.error("Save your current edits before switching notes.");
      return;
    }
    setOpening(true);
    try {
      setActive(await api<Note>(`notes/${note.id}`));
      setFocusTerms([]);
      setGeneration((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  const adopt = (note: Note) => {
    setFocusTerms([]);
    setView(note.dailyDate ? "journal" : "all");
    setTag("");
    setQuery("");
    setActive(note);
    setGeneration((n) => n + 1);
    void load();
  };
  async function create() {
    if (!(await guard.current())) {
      toast.error("Save your current edits before creating a note.");
      return false;
    }
    try {
      const note = await api<Note>("notes", { method: "POST", body: "{}" });
      setView("all");
      setTag("");
      setQuery("");
      setActive(note);
      setFocusTerms([]);
      setGeneration((n) => n + 1);
      setNotes((n) => [note, ...n]);
      setDrawer(false);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  const back = async () => {
    if (await guard.current()) {
      setActive(null);
      guard.current = async () => true;
      void load();
    } else toast.error("Your edits haven’t been saved yet.");
  };
  const filter = async (next: string, tagId = "") => {
    if (!(await guard.current())) return false;
    setSectionTarget({ query: "" });
    setView(next);
    setTag(tagId);
    setActive(null);
    guard.current = async () => true;
    setDrawer(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("note");
    window.history.replaceState(null, "", url);
    return true;
  };
  const navigateNote = useCallback(
    async (id: string, terms: string[] = []) => {
      if (!(await guard.current())) return false;
      try {
        const note = await api<Note>(`notes/${id}`);
        if (note.trashedAt) {
          toast.error(
            "This linked note is in trash. Restore it to open the connection.",
          );
          return false;
        }
        setView(note.dailyDate ? "journal" : "all");
        setTag("");
        setQuery("");
        setActive(note);
        setFocusTerms(terms);
        setGeneration((n) => n + 1);
        setDrawer(false);
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      }
    },
    [
      setGeneration,
      setActive,
      setFocusTerms,
      setView,
      setTag,
      setQuery,
      setDrawer,
    ],
  );
  useEffect(() => {
    if (initialLink.current) return;
    const id = new URL(window.location.href).searchParams.get("note");
    const timer = setTimeout(() => {
      initialLink.current = true;
      if (id && /^[a-f0-9-]{36}$/.test(id)) void navigateNote(id);
    }, 0);
    return () => clearTimeout(timer);
  }, [navigateNote]);
  useEffect(() => {
    if (!active) return;
    const url = new URL(window.location.href);
    url.searchParams.set("note", active.id);
    window.history.replaceState(null, "", url);
  }, [active]);
  async function today() {
    if (!(await guard.current())) return false;
    try {
      const note = await api<Note>("notes/daily", {
        method: "POST",
        body: JSON.stringify({ date: localDate() }),
      });
      adopt(note);
      setDrawer(false);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  async function selectResult(result: SearchResult) {
    if (result.type === "note")
      return navigateNote(result.id, result.matchTerms);
    if (result.type === "artifact") {
      if (!(await filter("artifacts"))) return false;
      setSectionTarget({ query: "", openId: result.id });
      setGeneration((n) => n + 1);
      return true;
    }
    if (!(await filter(result.type === "task" ? "tasks" : "bookmarks")))
      return false;
    setSectionTarget({ query: result.title, completed: result.completed });
    setGeneration((n) => n + 1);
    return true;
  }
  async function searchCommand(
    command: "note" | "task" | "bookmark" | "daily",
  ) {
    if (command === "note") return create();
    if (command === "daily") return today();
    if (!(await filter(command === "task" ? "tasks" : "bookmarks")))
      return false;
    setSectionTarget({ query: "", focusCreate: true });
    setGeneration((n) => n + 1);
    return true;
  }
  async function logout() {
    await authRequest("sign-out", {});
    sectionCache.clear();
    onSignOut();
  }
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (matches(e, shortcuts.search)) {
        e.preventDefault();
        setDrawer(false);
        globalSearch.current?.toggle();
      }
      if (matches(e, shortcuts.newNote)) {
        e.preventDefault();
        void create();
      }
      if (matches(e, shortcuts.capture)) {
        if (
          document.querySelector(
            '[data-slot="dialog-content"],[data-slot="alert-dialog-content"]',
          )
        )
          return;
        e.preventDefault();
        setDrawer(false);
        capture.current?.open();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  async function saveTag(e: React.FormEvent) {
    e.preventDefault();
    if (!tagDialog) return;
    setTagBusy(true);
    try {
      await api(tagDialog.id ? `tags/${tagDialog.id}` : "tags", {
        method: tagDialog.id ? "PATCH" : "POST",
        body: JSON.stringify({
          name: tagDialog.name,
          color: tagDialog.color || "gray",
        }),
      });
      setTagDialog(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTagBusy(false);
    }
  }
  async function deleteTag(item: Tag) {
    if (
      !(await confirm({
        title: `Delete “${item.name}”?`,
        description: "The tag will be removed. Your notes will be kept.",
        action: "Delete tag",
      }))
    )
      return;
    if (!(await guard.current())) return;
    try {
      await api(`tags/${item.id}`, { method: "DELETE" });
      if (tag === item.id) setTag("");
      if (active) adopt(await api<Note>(`notes/${active.id}`));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const navigation = (
    <div className="navigation">
      <header className="workspace-brand">
        <Mark small />
        <span>Nivra</span>
      </header>
      <Button className="new-note" onClick={() => void create()}>
        <Plus size={16} />
        New note
        <Shortcut chord={shortcuts.newNote} />
      </Button>
      <button
        className="nav-item workspace-search"
        aria-label="Search"
        onClick={() => {
          setDrawer(false);
          globalSearch.current?.open();
        }}
      >
        <Search size={16} />
        Search
        <Shortcut chord={shortcuts.search} className="nav-shortcut" />
      </button>
      <nav aria-label="Notes navigation">
        {[
          { id: "overview", label: "Overview", Icon: Grid2X2 },
          { id: "favorites", label: "Favorites", Icon: Heart },
          { id: "all", label: "Notes", Icon: StickyNote },
          { id: "journal", label: "Journal", Icon: NotebookPen },
          { id: "tasks", label: "Tasks", Icon: SquareCheckBig },
          { id: "bookmarks", label: "Bookmarks", Icon: LibraryBig },
          { id: "artifacts", label: "Artifacts", Icon: Layers },
          { id: "trash", label: "Trash", Icon: Trash },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id && !tag ? "active" : ""}`}
            aria-current={view === id && !tag ? "page" : undefined}
            onClick={() => void filter(id)}
          >
            <Icon size={18} strokeWidth={1.6} />
            {label}
          </button>
        ))}
      </nav>
      <div className="tags-heading">
        <span>Tags</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Create tag"
          onClick={() => setTagDialog({ name: "" })}
        >
          <Plus size={14} />
        </Button>
      </div>
      <div className="tag-navigation">
        {tags.map((item) => (
          <div
            key={item.id}
            className={`tag-nav-row ${tag === item.id ? "active" : ""}`}
          >
            <button onClick={() => void filter("all", item.id)}>
              <span className="tag-dot" data-color={item.color} />
              <span>{item.name}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Actions for ${item.name}`}
                  className="tag-menu"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setTagDialog(item)}>
                  <Pencil size={14} />
                  Edit tag
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void deleteTag(item)}>
                  <Trash2 size={14} />
                  Delete tag
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {!tags.length && (
          <button
            className="empty-tags"
            onClick={() => setTagDialog({ name: "" })}
          >
            Give your ideas a little order.
            <br />
            <span>Create your first tag</span>
          </button>
        )}
      </div>
      <div className="navigation-bottom">
        <button
          className="nav-item"
          onClick={() => {
            setDrawer(false);
            capture.current?.open();
          }}
        >
          <Inbox size={16} />
          Capture
          <Shortcut chord={shortcuts.capture} className="nav-shortcut" />
        </button>
        <footer className="navigation-footer">
          <button
            className="nav-item"
            onClick={() => {
              setDrawer(false);
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon size={16} />
            Settings
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Collapse sidebar"
            className="collapse-sidebar"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={16} />
          </Button>
        </footer>
      </div>
    </div>
  );
  const title = tag
    ? tags.find((t) => t.id === tag)?.name || "Notes"
    : view === "favorites"
      ? "Favorites"
      : view === "trash"
        ? "Trash"
        : view === "journal"
          ? "Journal"
          : "All notes";
  const scope = `${view}|${tag}`;
  const cachedList = search
    ? undefined
    : sectionCache.get<{ notes: NoteSummary[]; hasMore: boolean }>(
        `notes:${scope}|${sort}`,
      );
  const listReady = listScope === scope;
  const shownNotes = listReady ? notes : cachedList?.notes;
  const shownHasMore = listReady ? hasMore : !!cachedList?.hasMore;
  const rows = shownNotes ?? [];
  return (
    <main
      className={`workspace ${active ? "has-note" : ""} ${sidebar ? "" : "rail-hidden"}`}
    >
      {sidebar && <aside className="desktop-navigation">{navigation}</aside>}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="mobile-navigation">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {navigation}
        </SheetContent>
      </Sheet>
      {view === "overview" ? (
        <OverviewPanel
          onNavigation={() =>
            window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
          }
          onOpenNote={navigateNote}
          onSection={(section, query = "") => {
            void filter(section).then((changed) => {
              if (changed) {
                setSectionTarget({ query });
                setGeneration((n) => n + 1);
              }
            });
          }}
          onCreate={(kind) => void searchCommand(kind)}
        />
      ) : view === "tasks" ? (
        <TasksPanel
          key={generation}
          registerGuard={registerGuard}
          initialQuery={sectionTarget.query}
          initialFilter={sectionTarget.completed ? "completed" : "open"}
          focusCreate={sectionTarget.focusCreate}
          onOpenNote={navigateNote}
          onNavigation={() =>
            window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
          }
        />
      ) : view === "bookmarks" ? (
        <BookmarksPanel
          key={generation}
          registerGuard={registerGuard}
          initialQuery={sectionTarget.query}
          focusCreate={sectionTarget.focusCreate}
          onOpenNote={navigateNote}
          onNavigation={() =>
            window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
          }
        />
      ) : view === "artifacts" ? (
        <ArtifactsPanel
          key={generation}
          registerGuard={registerGuard}
          initialQuery={sectionTarget.query}
          openId={sectionTarget.openId}
          onNavigation={() =>
            window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
          }
        />
      ) : (
        <>
          <section className="notes-list">
            <header className="list-header">
              <div>
                <h1>{title}</h1>
                <span
                  className={`note-count ${shownNotes ? "" : "is-pending"}`}
                >
                  {rows.length}
                  {shownHasMore ? "+" : ""}
                </span>
              </div>
              {view === "journal" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Write today’s entry"
                  title="Write today’s entry"
                  onClick={() => void today()}
                >
                  <Plus size={16} />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Sort notes">
                    <ArrowUpDown size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {[
                    { value: "updated", label: "Last edited" },
                    { value: "created", label: "Date created" },
                    { value: "title", label: "Title" },
                  ].map((item) => (
                    <DropdownMenuItem
                      key={item.value}
                      onSelect={() => setSort(item.value)}
                    >
                      {item.label}
                      {sort === item.value && (
                        <span className="ml-auto">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="menu-toggle"
                aria-label="Open navigation"
                onClick={() =>
                  window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
                }
              >
                <Menu size={18} />
              </Button>
            </header>
            <div className="search-field">
              <Search size={15} />
              <Input
                ref={searchRef}
                aria-label="Search notes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes…"
              />
            </div>
            <div className="note-list-scroll" aria-label="Note list">
              {error ? (
                <div className="list-empty">
                  <p role="alert">{error}</p>
                  <Button variant="outline" size="sm" onClick={load}>
                    <RefreshCw size={14} />
                    Try again
                  </Button>
                </div>
              ) : shownNotes === undefined ? (
                <div
                  className="list-skeleton"
                  role="status"
                  aria-label="Loading notes"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n}>
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : !rows.length ? (
                <div className="list-empty">
                  <FileText size={25} />
                  <h2>
                    {query
                      ? "No matching notes"
                      : view === "trash"
                        ? "Nothing in trash"
                        : view === "favorites"
                          ? "Keep good ideas close"
                          : view === "journal"
                            ? "Your journal is empty"
                            : "A fresh page awaits"}
                  </h2>
                  <p>
                    {query
                      ? "Try a different word or tag."
                      : view === "favorites"
                        ? "Star a note to find it here."
                        : view === "trash"
                          ? "Notes you delete will appear here."
                          : view === "journal"
                            ? "One entry for each day you write."
                            : "Start with a thought. The rest will follow."}
                  </p>
                  {view === "all" && !query && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void create()}
                    >
                      <Plus size={14} />
                      Create a note
                    </Button>
                  )}
                  {view === "journal" && !query && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void today()}
                    >
                      <Plus size={14} />
                      Write today’s entry
                    </Button>
                  )}
                </div>
              ) : (
                rows.map((note) => (
                  <button
                    className={`note-list-item ${active?.id === note.id ? "selected" : ""}`}
                    key={note.id}
                    onClick={() => void open(note)}
                  >
                    <div>
                      <strong>{note.title || "Untitled"}</strong>
                      {note.favorite && <Star size={12} fill="currentColor" />}
                    </div>
                    <p>
                      {note.text.replace(/\s+/g, " ").slice(0, 110) ||
                        "An idea waiting to happen…"}
                    </p>
                    <footer>
                      <time>
                        {new Date(note.updatedAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </time>
                      {note.tags.slice(0, 2).map((tag) => (
                        <span key={tag.id}>
                          <span className="tag-dot" data-color={tag.color} />
                          <span className="tag-name">{tag.name}</span>
                        </span>
                      ))}
                    </footer>
                  </button>
                ))
              )}
              {!error && shownHasMore && (
                <div className="note-list-more">
                  {moreError && <p role="alert">{moreError}</p>}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={loading || loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore
                      ? "Loading…"
                      : moreError
                        ? "Try again"
                        : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          </section>
          {active ? (
            <NotePane
              key={`${active.id}-${generation}`}
              initial={active}
              focusTerms={focusTerms}
              onCapture={() => capture.current?.open()}
              tags={tags}
              onSaved={onSaved}
              onBack={() => void back()}
              onOpen={adopt}
              onDeleted={() => {
                setActive(null);
                guard.current = async () => true;
                void load();
              }}
              registerGuard={registerGuard}
              onNavigateNote={navigateNote}
              onNavigateItem={selectResult}
            />
          ) : (
            <section className="workspace-empty">
              {opening ? (
                <Loader2 className="animate-spin" aria-label="Opening note" />
              ) : (
                <>
                  <div className="empty-illustration">
                    <FileText size={38} strokeWidth={1} />
                  </div>
                  <h2>Room for your next idea.</h2>
                  <p>
                    Pick a note to keep going,
                    <br />
                    or start something new.
                  </p>
                  <Button variant="outline" onClick={() => void create()}>
                    Create a note
                    <ArrowRight size={15} />
                  </Button>
                  <span className="shortcut-hint">
                    <ShortcutKeys chord={shortcuts.newNote} />
                    <span>to create a note</span>
                  </span>
                </>
              )}
            </section>
          )}
        </>
      )}
      <Dialog
        open={!!tagDialog}
        onOpenChange={(open) => {
          if (!open) setTagDialog(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {tagDialog?.id ? "Edit tag" : "Create a tag"}
          </DialogTitle>
          <DialogDescription>
            A simple way to connect related ideas.
          </DialogDescription>
          <form className="space-y-4" onSubmit={saveTag}>
            <Input
              aria-label="Tag name"
              autoFocus
              maxLength={50}
              required
              value={tagDialog?.name || ""}
              onChange={(e) =>
                setTagDialog((previous) =>
                  previous ? { ...previous, name: e.target.value } : previous,
                )
              }
              placeholder="e.g. Personal, Projects, Reading"
            />
            <TagColorPicker
              value={tagDialog?.color || "gray"}
              onChange={(color) =>
                setTagDialog((previous) =>
                  previous ? { ...previous, color } : previous,
                )
              }
            />
            <Button type="submit" disabled={tagBusy}>
              {tagBusy && <Loader2 size={14} className="animate-spin" />}
              {tagDialog?.id ? "Save tag" : "Create tag"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <GlobalSearch
        ref={globalSearch}
        onSelect={selectResult}
        onCommand={searchCommand}
      />
      <QuickCapture ref={capture} onCaptured={captured} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        owner={owner}
        initial={initialSettings}
        onSignOut={logout}
        beforeAction={() => guard.current()}
        onImported={async () => {
          sectionCache.clear();
          await load();
          if (view === "tasks" || view === "bookmarks")
            setGeneration((value) => value + 1);
        }}
      />
    </main>
  );
}
