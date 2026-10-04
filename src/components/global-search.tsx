"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  CalendarDays,
  FileText,
  ListTodo,
  Loader2,
  Plus,
} from "lucide-react";
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
export function GlobalSearch({
  open,
  onClose,
  onSelect,
  onCommand,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => Promise<boolean>;
  onCommand: (
    command: "note" | "task" | "bookmark" | "daily",
  ) => Promise<boolean>;
}) {
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
    const timer = setTimeout(() => {
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
    }, 150);
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
          value={selection}
          onValueChange={setSelection}
          vimBindings={false}
        >
          <CommandInput
            aria-label="Search everything"
            placeholder="Search notes, tasks, bookmarks…"
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
          <p className="search-hint">
            Filter with <span>type:note</span>, <span>type:task</span> or{" "}
            <span>tag:work</span>
          </p>
          <CommandList label="Search results">
            {error ? (
              <p className="picker-message" role="alert">
                {error} Change your search to retry.
              </p>
            ) : loading ? (
              <div className="picker-message" role="status">
                <Loader2 size={16} className="animate-spin" />
                Searching…
              </div>
            ) : (
              <CommandGroup
                heading={query.trim() ? "Results" : "Recently edited"}
              >
                {!results.length ? (
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
                        disabled={busy}
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
                          {result.type}
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
                    title: "Open today’s note",
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
        </Command>
      </DialogContent>
    </Dialog>
  );
}
