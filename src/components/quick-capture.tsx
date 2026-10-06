"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Bookmark, FileText, ListTodo, Loader2 } from "lucide-react";
import { notify } from "@/lib/feedback";
import { api } from "@/lib/client";
import type { Note, Task, Bookmark as SavedBookmark } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

import { shortcutParts, useIsApple } from "@/lib/shortcuts";
export type CaptureHandle = { open: () => void };
export type CapturedItem =
  | { type: "note"; item: Note }
  | { type: "task"; item: Task }
  | { type: "bookmark"; item: SavedBookmark };
export function QuickCapture({
  ref,
  onCaptured,
}: {
  ref: Ref<CaptureHandle>;
  onCaptured: (result: CapturedItem) => void;
}) {
  const apple = useIsApple();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<CapturedItem["type"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  const value = text.trim();
  let url = false;
  try {
    const parsed = new URL(value);
    url = /^https?:$/.test(parsed.protocol) && !/\s/.test(value);
  } catch {}
  const type = choice || (url ? "bookmark" : "note");
  const valid =
    !!value &&
    (type !== "task" || value.length <= 300) &&
    (type !== "bookmark" || (url && value.length <= 4096));
  useEffect(() => {
    if (!value) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [value]);
  const save = async () => {
    if (!valid || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      let result: CapturedItem;
      if (type === "note") {
        const document = {
          schemaVersion: 1,
          blocks: text.split(/\r?\n/).map((line) => ({
            id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
            type: "paragraph",
            content: line ? [{ type: "text", text: line, styles: {} }] : [],
          })),
        };
        result = {
          type,
          item: await api<Note>("notes", {
            method: "POST",
            body: JSON.stringify({
              title: value.split(/\r?\n/)[0].slice(0, 100),
              document,
            }),
          }),
        };
      } else if (type === "task")
        result = {
          type,
          item: await api<Task>("tasks", {
            method: "POST",
            body: JSON.stringify({ title: value }),
          }),
        };
      else
        result = {
          type,
          item: await api<SavedBookmark>("bookmarks", {
            method: "POST",
            body: JSON.stringify({ url: value }),
          }),
        };
      onCaptured(result);
      setText("");
      setChoice(null);
      setOpen(false);
      notify.success(
        type === "note"
          ? "Note saved."
          : type === "task"
            ? "Task saved."
            : "Bookmark saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogContent
        className="quick-capture-dialog"
        overlayClassName="supports-backdrop-filter:backdrop-filter-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogTitle>Quick</DialogTitle>
        <DialogDescription className="sr-only">
          Save a note, task or bookmark without leaving your current work.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="capture-types" role="group" aria-label="Save as">
            {[
              { type: "note", label: "Note", Icon: FileText },
              { type: "task", label: "Task", Icon: ListTodo },
              { type: "bookmark", label: "Link", Icon: Bookmark },
            ].map(({ type: kind, label, Icon }) => (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                aria-pressed={type === kind}
                disabled={busy}
                onClick={() => {
                  setChoice(kind as CapturedItem["type"]);
                  setError("");
                  input.current?.focus();
                }}
              >
                <Icon size={15} />
                {label}
              </Button>
            ))}
          </div>
          <Textarea
            ref={input}
            aria-label="Quick text"
            placeholder={
              type === "task"
                ? "What needs doing?"
                : type === "bookmark"
                  ? "Paste a link…"
                  : "Write a thought or paste a link…"
            }
            value={text}
            maxLength={20000}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
          {type === "task" && value.length > 300 && (
            <p className="capture-error" role="alert">
              Keep task titles within 300 characters, or save this as a note.
            </p>
          )}
          {type === "bookmark" && value && !url && (
            <p className="capture-error" role="alert">
              Enter one complete HTTP or HTTPS link.
            </p>
          )}
          {type === "bookmark" && value.length > 4096 && (
            <p className="capture-error" role="alert">
              Keep links within 4,096 characters.
            </p>
          )}
          {error && (
            <p className="capture-error" role="alert">
              {error} Your draft is kept here.
            </p>
          )}
          <div className="capture-footer">
            <span className="capture-shortcut">
              {shortcutParts({ key: "Enter", code: "Enter" }, apple).join(
                apple ? " " : "+",
              )}{" "}
              to save
            </span>
            <Button type="submit" disabled={busy || !valid}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy
                ? "Saving…"
                : type === "note"
                  ? "Save note"
                  : type === "task"
                    ? "Save task"
                    : "Save link"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
