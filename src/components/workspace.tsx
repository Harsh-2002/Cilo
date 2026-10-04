"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Star,
  Trash2,
  Search,
  Plus,
  Settings as SettingsIcon,
  LogOut,
  PanelLeftClose,
  Menu,
  MoreHorizontal,
  Pencil,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  ArrowRight,
  ListTodo,
  Bookmark,
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
import type { Note, NoteSummary, Owner, Settings, Tag } from "@/lib/types";
import { NotePane } from "./note-pane";
import { useConfirm } from "./confirm-provider";
import { TagColorPicker } from "./tag-color-picker";
import type { TagColor } from "@/lib/tags";
import { SettingsPanel } from "./settings-panel";
import { BookmarksPanel } from "./bookmarks-panel";
import { TasksPanel } from "./tasks-panel";

export function Workspace({
  owner,
  initialSettings,
  onSignOut,
}: {
  owner: Owner;
  initialSettings: Settings;
  onSignOut: () => void;
}) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [view, setView] = useState("all");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        ...(tag ? { tag } : {}),
      });
      const [list, allTags] = await Promise.all([
        api<NoteSummary[]>(`notes?${params}`),
        api<Tag[]>("tags"),
      ]);
      if (seq === loadSequence.current) {
        setNotes(list);
        setTags(allTags);
      }
    } catch (e) {
      if (seq === loadSequence.current) setError((e as Error).message);
    } finally {
      if (seq === loadSequence.current) setLoading(false);
    }
  }, [view, tag, search, sort]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
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
      setGeneration((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  const adopt = (note: Note) => {
    setActive(note);
    setGeneration((n) => n + 1);
    void load();
  };
  async function create() {
    if (!(await guard.current())) {
      toast.error("Save your current edits before creating a note.");
      return;
    }
    try {
      const note = await api<Note>("notes", { method: "POST", body: "{}" });
      setView("all");
      setTag("");
      setQuery("");
      setActive(note);
      setGeneration((n) => n + 1);
      setNotes((n) => [note, ...n]);
      setDrawer(false);
    } catch (e) {
      toast.error((e as Error).message);
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
    if (!(await guard.current())) return;
    setView(next);
    setTag(tagId);
    setActive(null);
    guard.current = async () => true;
    setDrawer(false);
  };
  async function logout() {
    if (!(await guard.current())) return;
    try {
      await authRequest("sign-out", {});
      onSignOut();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (view === "bookmarks") return;
        e.preventDefault();
        void (async () => {
          if (window.innerWidth < 768 && !(await guard.current())) return;
          if (window.innerWidth < 768) setActive(null);
          setTimeout(() => searchRef.current?.focus(), 0);
        })();
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void create();
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
        <span>Cilo</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collapse sidebar"
          className="collapse-sidebar"
          onClick={() => setSidebar(false)}
        >
          <PanelLeftClose size={16} />
        </Button>
      </header>
      <Button className="new-note" onClick={() => void create()}>
        <Plus size={16} />
        New note<span>⌥ N</span>
      </Button>
      <nav aria-label="Notes navigation">
        {[
          { id: "all", label: "All notes", Icon: FileText },
          { id: "favorites", label: "Favorites", Icon: Star },
          { id: "trash", label: "Trash", Icon: Trash2 },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id && !tag ? "active" : ""}`}
            onClick={() => void filter(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button
          className={`nav-item ${view === "tasks" ? "active" : ""}`}
          onClick={() => void filter("tasks")}
        >
          <ListTodo size={16} />
          Tasks
        </button>
        <button
          className={`nav-item ${view === "bookmarks" ? "active" : ""}`}
          onClick={() => void filter("bookmarks")}
        >
          <Bookmark size={16} />
          Bookmarks
        </button>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="owner-button">
              <span className="avatar">
                {owner.name.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{owner.name}</strong>
                <small>Your personal space</small>
              </span>
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut size={15} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </div>
  );
  const title = tag
    ? tags.find((t) => t.id === tag)?.name || "Notes"
    : view === "favorites"
      ? "Favorites"
      : view === "trash"
        ? "Trash"
        : "All notes";
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
      {view === "tasks" ? (
        <TasksPanel
          key={generation}
          registerGuard={registerGuard}
          onNavigation={() =>
            window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
          }
        />
      ) : view === "bookmarks" ? (
        <BookmarksPanel
          key={generation}
          registerGuard={registerGuard}
          onNavigation={() =>
            window.innerWidth < 1024 ? setDrawer(true) : setSidebar(true)
          }
        />
      ) : (
        <>
          <section className="notes-list">
            <header className="list-header">
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="menu-toggle"
                  aria-label="Open navigation"
                  onClick={() =>
                    window.innerWidth < 1024
                      ? setDrawer(true)
                      : setSidebar(true)
                  }
                >
                  <Menu size={18} />
                </Button>
                <h1>{title}</h1>
                <span className="note-count">{notes.length}</span>
              </div>
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
              <kbd>⌘ K</kbd>
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
              ) : loading && !notes.length ? (
                <div className="list-skeleton">
                  {[1, 2, 3].map((n) => (
                    <div key={n}>
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : !notes.length ? (
                <div className="list-empty">
                  <FileText size={25} />
                  <h2>
                    {query
                      ? "No matching notes"
                      : view === "trash"
                        ? "Nothing in trash"
                        : view === "favorites"
                          ? "Keep good ideas close"
                          : "A fresh page awaits"}
                  </h2>
                  <p>
                    {query
                      ? "Try a different word or tag."
                      : view === "favorites"
                        ? "Star a note to find it here."
                        : view === "trash"
                          ? "Notes you delete will appear here."
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
                </div>
              ) : (
                notes.map((note) => (
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
                          {tag.name}
                        </span>
                      ))}
                    </footer>
                  </button>
                ))
              )}
            </div>
            <footer className="list-footer">
              <span>
                {notes.length} {notes.length === 1 ? "note" : "notes"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Create note"
                onClick={() => void create()}
              >
                <Plus size={16} />
              </Button>
            </footer>
          </section>
          {active ? (
            <NotePane
              key={`${active.id}-${generation}`}
              initial={active}
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
                    <kbd>⌘</kbd>
                    <kbd>⌥</kbd>
                    <kbd>N</kbd>
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
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        owner={owner}
        initial={initialSettings}
        beforeAction={() => guard.current()}
        onImported={async () => {
          await load();
          if (view === "tasks" || view === "bookmarks")
            setGeneration((value) => value + 1);
        }}
      />
    </main>
  );
}
