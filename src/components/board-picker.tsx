"use client";
import { useEffect, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { Board, Page } from "@/lib/types";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "./ui/command";
export function BoardPicker({
  value,
  name,
  onChange,
  archived = false,
  allowAll = false,
  disabled = false,
  emptyLabel = "All tasks",
}: {
  value: string | null;
  name?: string;
  onChange: (board: Board | null) => void;
  archived?: boolean;
  allowAll?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState<Page<Board>>({ items: [], next: null }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void api<Page<Board>>(
        `boards?limit=50&archived=${archived ? 1 : 0}&q=${encodeURIComponent(query)}`,
        { signal: abort.signal },
      )
        .then((p) => {
          if (!abort.signal.aborted) setPage(p);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [open, query, archived]);
  async function more() {
    setLoading(true);
    try {
      const p = await api<Page<Board>>(
        `boards?limit=50&archived=${archived ? 1 : 0}&q=${encodeURIComponent(query)}&after=${encodeURIComponent(page.next!)}`,
      );
      setPage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setLoading(true);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="board-picker-trigger"
          role="combobox"
          aria-expanded={open}
          aria-label="Select board"
          disabled={disabled}
        >
          <span>
            {value ? name || "Board" : allowAll ? emptyLabel : "Select board"}
          </span>
          <ChevronsUpDown size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="board-picker-popover">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Find a board…"
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setLoading(true);
            }}
          />
          <CommandList>
            {allowAll && (
              <CommandItem
                value="all"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {emptyLabel}
              </CommandItem>
            )}
            {loading ? (
              <p className="picker-message" role="status">
                Loading boards…
              </p>
            ) : error ? (
              <p className="picker-message" role="alert">
                {error}
              </p>
            ) : page.items.length ? (
              page.items.map((board) => (
                <CommandItem
                  key={board.id}
                  value={board.id}
                  onSelect={() => {
                    onChange(board);
                    setOpen(false);
                  }}
                >
                  {board.name}
                </CommandItem>
              ))
            ) : (
              <p className="picker-message">
                No {archived ? "archived " : ""}boards.
              </p>
            )}
            {page.next && !loading && (
              <CommandItem value="more" onSelect={() => void more()}>
                More boards
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
