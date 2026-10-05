"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Bookmark,
  CalendarDays,
  FileText,
  ListTodo,
  Loader2,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { api } from "@/lib/client";
import type { SearchResult } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandGroup,
  CommandSeparator,
} from "./ui/command";
export type SearchHandle = { open: () => void; toggle: () => void };
export function GlobalSearch({
  ref,
  onSelect,
  onCommand,
}: {
  ref: Ref<SearchHandle>;
  onSelect: (result: SearchResult) => Promise<boolean>;
  onCommand: (
    command: "note" | "task" | "bookmark" | "daily",
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setFiltersOpen(false);
        setOpen(true);
      },
      toggle: () => {
        setFiltersOpen(false);
        setOpen((value) => !value);
      },
    }),
    [],
  );
  const onClose = () => {
    setFiltersOpen(false);
    setOpen(false);
  };
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  const nextFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        void api<SearchResult[]>(`search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
          .then((items) => {
            if (!controller.signal.aborted) {
              setResults(items);
              setSelection(items[0] ? `${items[0].type}-${items[0].id}` : "");
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError((e as Error).message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query.trim() ? 120 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);
  const run = async (action: () => Promise<boolean>, focus: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (await action()) {
        nextFocus.current = focus;
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="global-search-dialog"
        overlayClassName="supports-backdrop-filter:backdrop-filter-none"
        onEscapeKeyDown={(event) => {
          if (filtersOpen) {
            event.preventDefault();
            setFiltersOpen(false);
          }
        }}
        onCloseAutoFocus={(event) => {
          if (nextFocus.current) {
            event.preventDefault();
            document
              .querySelector<HTMLInputElement>(nextFocus.current)
              ?.focus();
            nextFocus.current = null;
          }
        }}
      >
        <DialogTitle className="sr-only">Search Cilo</DialogTitle>
        <DialogDescription className="sr-only">
          Find notes, tasks and bookmarks, or create something new.
        </DialogDescription>
        <Command
          shouldFilter={false}
          label="Search everything"
          loop
          value={selection}
          onValueChange={setSelection}
          vimBindings={false}
        >
          <CommandInput
            ref={searchInput}
            aria-label="Search everything"
            placeholder="Search everything…"
            value={query}
            maxLength={300}
            disabled={busy}
            onValueChange={(value) => {
              setQuery(value);
              setLoading(true);
              setSelection("");
              setError("");
            }}
          />
          <CommandList label="Search results" aria-busy={loading}>
            {loading && (
              <div className="search-progress" role="status">
                <Loader2 size={14} className="animate-spin" />
                <span className="sr-only">Searching…</span>
              </div>
            )}
            {error ? (
              <p className="picker-message" role="alert">
                {error} Change your search to retry.
              </p>
            ) : (
              <CommandGroup
                heading={query.trim() ? "Results" : "Recently edited"}
              >
                {!results.length && loading ? (
                  <div className="search-result-placeholder" />
                ) : !results.length ? (
                  <p className="picker-message">
                    No matching items. Try another word or filter.
                  </p>
                ) : (
                  results.map((result) => {
                    const Icon =
                      result.type === "note"
                        ? FileText
                        : result.type === "task"
                          ? ListTodo
                          : Bookmark;
                    return (
                      <CommandItem
                        disabled={busy || loading}
                        key={`${result.type}-${result.id}`}
                        value={`${result.type}-${result.id}`}
                        onSelect={() =>
                          void run(
                            () => onSelect(result),
                            result.type === "note"
                              ? ".note-title"
                              : result.type === "task"
                                ? 'input[aria-label="Search tasks"]'
                                : 'input[aria-label="Search bookmarks"]',
                          )
                        }
                      >
                        <Icon />
                        <span className="search-result-copy">
                          <strong>{result.title || "Untitled"}</strong>
                          <small>
                            {result.excerpt.replace(/\s+/g, " ").slice(0, 100)}
                          </small>
                        </span>
                        <span className="search-result-type">
                          {result.type === "note"
                            ? "Note"
                            : result.type === "task"
                              ? "Task"
                              : "Bookmark"}
                          {result.completed ? " · done" : ""}
                        </span>
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Create">
              {(
                [
                  { id: "note", title: "New note", Icon: Plus },
                  { id: "task", title: "Add a task", Icon: ListTodo },
                  { id: "bookmark", title: "Save a bookmark", Icon: Bookmark },
                  {
                    id: "daily",
                    title: "Open journal",
                    Icon: CalendarDays,
                  },
                ] as const
              ).map(({ id, title, Icon }) => (
                <CommandItem
                  key={id}
                  value={`create-${id}`}
                  disabled={busy || (loading && !!query.trim())}
                  onSelect={() =>
                    void run(
                      () => onCommand(id),
                      id === "task"
                        ? 'input[aria-label="New task"]'
                        : id === "bookmark"
                          ? "#bookmark-url"
                          : ".note-title",
                    )
                  }
                >
                  <Icon />
                  {title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="search-keyboard-hints" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> Navigate
            </span>
            <span>
              <kbd>↵</kbd> Open
            </span>
            <span>
              <kbd>Esc</kbd> Close
            </span>
          </div>
        </Command>
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="search-filter-trigger"
              aria-label="Search filters"
              disabled={busy}
            >
              <SlidersHorizontal size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="search-filter-help"
            aria-label="Search filters"
            onCloseAutoFocus={(event) => {
              if (searchInput.current) {
                event.preventDefault();
                searchInput.current.focus();
              }
            }}
          >
            <p className="font-medium">Search filters</p>
            <dl>
              <div>
                <dt>Notes</dt>
                <dd>
                  <code>type:note</code>
                </dd>
              </div>
              <div>
                <dt>Tasks</dt>
                <dd>
                  <code>type:task</code>
                </dd>
              </div>
              <div>
                <dt>Bookmarks</dt>
                <dd>
                  <code>type:bookmark</code>
                </dd>
              </div>
              <div>
                <dt>Tags</dt>
                <dd>
                  <code>tag:work</code>
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Combine a filter with your search.
            </p>
          </PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>
  );
}
