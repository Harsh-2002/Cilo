"use client";
import { useEffect, useState } from "react";
import { ChevronsUpDown, FileText, Loader2, X } from "lucide-react";
import { apiItems } from "@/lib/client";
import type { NoteSummary } from "@/lib/types";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "./ui/command";
export function NotePicker({
  value,
  title,
  onChange,
  disabled = false,
}: {
  value: string | null;
  title?: string | null;
  onChange: (id: string | null, title: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void apiItems<NoteSummary>(
        `notes?limit=30&q=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
        },
      )
        .then((items) => {
          if (!controller.signal.aborted) {
            setNotes(items);
            setSelection(items[0]?.id || "");
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
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setLoading(true);
          setSelection("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="note-picker-trigger"
          role="combobox"
          aria-label="Linked note"
          aria-expanded={open}
        >
          <FileText size={15} />
          <span>{value ? title || "Untitled" : "Link to a note"}</span>
          <ChevronsUpDown size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="note-picker-popover">
        <Command
          shouldFilter={false}
          label="Find a note to link"
          value={selection}
          onValueChange={setSelection}
        >
          <CommandInput
            aria-label="Find a note to link"
            placeholder="Find a note…"
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setLoading(true);
              setSelection("");
              setError("");
            }}
          />
          <CommandList label="Available notes">
            {value && (
              <CommandItem
                value="clear"
                disabled={loading}
                onSelect={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
              >
                <X />
                Remove note link
              </CommandItem>
            )}
            {loading ? (
              <div className="picker-message" role="status">
                <Loader2 className="animate-spin" size={16} />
                Finding notes…
              </div>
            ) : error ? (
              <p className="picker-message" role="alert">
                {error} Try another search.
              </p>
            ) : !notes.length ? (
              <p className="picker-message">No available notes.</p>
            ) : (
              notes.map((note) => (
                <CommandItem
                  key={note.id}
                  value={note.id}
                  onSelect={() => {
                    onChange(note.id, note.title);
                    setOpen(false);
                  }}
                >
                  <FileText />
                  <span className="truncate">{note.title || "Untitled"}</span>
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
