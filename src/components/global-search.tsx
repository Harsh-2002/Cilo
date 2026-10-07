"use client";
import { ResponsiveSurface } from "./responsive-surface";
import { LoadingState } from "./loading-state";
import { useCompletion } from "@/lib/completion-client";
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
  Image as ImageIcon,
  Layers,
  ListTodo,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "./ui/button";
import { SearchText } from "./search-text";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { api } from "@/lib/client";
import type { SearchResult } from "@/lib/types";
import { DialogTitle, DialogDescription } from "./ui/dialog";
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
  const opener = useRef<HTMLElement | null>(null);
  const remember = () => {
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  };
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        remember();
        setFiltersOpen(false);
        setOpen(true);
      },
      toggle: () => {
        if (!document.querySelector(".global-search-dialog")) remember();
        setOpen((value) => !value);
        setFiltersOpen(false);
      },
    }),
    [],
  );
  const onClose = () => {
    setFiltersOpen(false);
    setOpen(false);
  };
  const [query, setQuery] = useState("");
  const [completionVersion, setCompletionVersion] = useState(0);
  useCompletion(undefined, () => {
    if (open) setCompletionVersion((version) => version + 1);
  });
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
  }, [open, query, completionVersion]);
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
    <ResponsiveSurface
      surface="search"
      title="Search"
      blocked={busy}
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else if (!busy) onClose();
      }}
      className="global-search-dialog"
      overlayClassName="search-overlay supports-backdrop-filter:backdrop-filter-none"
      onEscapeKeyDown={(event) => {
        if (filtersOpen) {
          event.preventDefault();
          setFiltersOpen(false);
        }
      }}
      onCloseAutoFocus={(event) => {
        if (nextFocus.current) {
          event.preventDefault();
          document.querySelector<HTMLInputElement>(nextFocus.current)?.focus();
          nextFocus.current = null;
        } else if (opener.current?.isConnected) {
          event.preventDefault();
          opener.current.focus();
        }
        opener.current = null;
      }}
    >
      <DialogTitle className="sr-only">Search Nivra</DialogTitle>
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
          {loading && !results.length ? (
            <LoadingState kind="search" label="Loading search results" />
          ) : loading ? (
            <span className="sr-only" role="status">
              Searching…
            </span>
          ) : null}
          {error ? (
            <p className="picker-message" role="alert">
              {error} Change your search to retry.
            </p>
          ) : !loading && !results.length ? (
            <p className="picker-message" role="status">
              No matching items. Try another word or filter.
            </p>
          ) : null}

          {!error && !!results.length && (
            <CommandGroup
              heading={query.trim() ? "Results" : "Recently edited"}
            >
              {results.map((result) => {
                const Icon =
                  result.type === "note"
                    ? FileText
                    : result.type === "task"
                      ? ListTodo
                      : result.type === "artifact"
                        ? result.artifactKind === "image"
                          ? ImageIcon
                          : Layers
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
                          ? result.matchTerms?.length
                            ? '[aria-label="Note content"]'
                            : ".note-title"
                          : result.type === "task"
                            ? 'input[aria-label="Search tasks"]'
                            : result.type === "artifact"
                              ? 'input[aria-label="Search artifacts"]'
                              : 'input[aria-label="Search bookmarks"]',
                      )
                    }
                  >
                    <Icon />
                    <span className="search-result-copy">
                      <strong>
                        <SearchText
                          text={result.title || "Untitled"}
                          ranges={result.titleMatches}
                        />
                      </strong>
                      <small>
                        <SearchText
                          text={result.excerpt}
                          ranges={result.excerptMatches}
                        />
                      </small>
                    </span>
                    <span className="search-result-type">
                      {result.type === "note"
                        ? "Note"
                        : result.type === "task"
                          ? "Task"
                          : result.type === "artifact"
                            ? "Artifact"
                            : "Bookmark"}
                      {result.completed ? " · done" : ""}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          <CommandSeparator aria-hidden="true" />
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
              <dt>Artifacts</dt>
              <dd>
                <code>type:artifact</code>
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
    </ResponsiveSurface>
  );
}
