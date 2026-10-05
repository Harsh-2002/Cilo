"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
  AlertCircle,
  Share2,
  History,
  LayoutTemplate,
  AlignCenter,
  MoveHorizontal,
  CalendarDays,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { remapDocument } from "@/lib/document";
import { api, ApiError, downloadRequest } from "@/lib/client";
import type { Note, Tag, SearchResult } from "@/lib/types";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { HistoryDialog } from "./history-dialog";
import { NoteConnections } from "./note-connections";
import type { EditorTools } from "./editor";
import { useConfirm } from "./confirm-provider";
import { PublishDialog } from "./publish-dialog";

const Editor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => (
    <div className="editor-skeleton" role="status" aria-label="Loading editor">
      <span />
      <span />
      <span />
    </div>
  ),
});
type Props = {
  initial: Note;
  focusTerms?: string[];
  onCapture: () => void;
  tags: Tag[];
  onSaved: (note: Note) => void;
  onBack: () => void;
  onOpen: (note: Note) => void;
  onDeleted: () => void;
  registerGuard: (guard: () => Promise<boolean>) => void;
  onNavigateNote: (id: string) => Promise<boolean>;
  onNavigateItem: (item: SearchResult) => Promise<boolean>;
};
export function NotePane({
  initial,
  focusTerms,
  onCapture,
  tags,
  onSaved,
  onBack,
  onOpen,
  onDeleted,
  registerGuard,
  onNavigateNote,
  onNavigateItem,
}: Props) {
  const [note, setNote] = useState(initial);
  const current = useRef(initial);
  const capturePending = useRef(false);
  const [state, setState] = useState<
    "saved" | "saving" | "dirty" | "error" | "conflict"
  >("saved");
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [history, setHistory] = useState(false);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const confirm = useConfirm();
  const version = useRef(0);
  const savedVersion = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const blocked = useRef(false);
  const tools = useRef<EditorTools | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    let width = 0;
    let active = true;
    let frame = 0;
    const resize = () => {
      if (!active || title.getBoundingClientRect().width <= 0) return;
      title.style.height = "auto";
      title.style.height = `${title.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width <= 0 || entry.contentRect.width === width)
        return;
      width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(title);
    void document.fonts.ready.then(resize);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [note.title]);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const setTools = useCallback((value: EditorTools) => {
    tools.current = value;
  }, []);
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) {
      await saving.current;
      if (blocked.current) return false;
      return flushRef.current();
    }
    if (savedVersion.current === version.current) return true;
    if (blocked.current) return false;
    const snapshot = current.current;
    const checkpoint = version.current;
    setState("saving");
    const promise = (async () => {
      try {
        const result = await api<Note>(`notes/${snapshot.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            revision: snapshot.revision,
            title: snapshot.title,
            document: snapshot.document,
            favorite: snapshot.favorite,
            editorWidth: snapshot.editorWidth,
            tags: snapshot.tags.map((t) => t.id),
          }),
        });
        savedVersion.current = checkpoint;
        current.current = {
          ...current.current,
          revision: result.revision,
          updatedAt: result.updatedAt,
        };
        if (mounted.current) {
          setNote(current.current);
          setState(checkpoint === version.current ? "saved" : "dirty");
          setError("");
        }
        onSaved(result);
        return true;
      } catch (e) {
        if (mounted.current) {
          const conflict = e instanceof ApiError && e.status === 409;
          setState(conflict ? "conflict" : "error");
          setError((e as Error).message);
          blocked.current = conflict;
        }
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = promise;
    const success = await promise;
    if (success && savedVersion.current !== version.current)
      return flushRef.current();
    return success;
  }, [onSaved]);
  useEffect(() => {
    flushRef.current = flush;
    registerGuard(flush);
  }, [flush, registerGuard]);
  useEffect(() => {
    mounted.current = true;
    const unload = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const reconnect = () => {
      void flushRef.current();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("online", reconnect);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("online", reconnect);
    };
  }, []);
  function change(update: Partial<Note>) {
    current.current = { ...current.current, ...update };
    setNote(current.current);
    version.current++;
    setState(blocked.current ? "conflict" : "dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushRef.current();
    }, 750);
  }
  async function action(run: () => Promise<void>, requireSave = true) {
    try {
      if (requireSave && !(await flush())) return;
      await run();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function toggleTrash() {
    await action(async () => {
      const result = await api<Note>(`notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: current.current.revision,
          trashed: !note.trashedAt,
        }),
      });
      current.current = result;
      setNote(result);
      onSaved(result);
      onDeleted();
    });
  }
  async function permanentDelete() {
    if (
      !(await confirm({
        title: "Delete this note permanently?",
        description:
          "This removes the note and its files. This cannot be undone.",
        action: "Delete permanently",
      }))
    )
      return;
    await action(async () => {
      await api(`notes/${note.id}`, { method: "DELETE" });
      onDeleted();
    });
  }
  async function saveCopy() {
    await action(async () => {
      const result = await api<
        Note & { attachmentMap: Record<string, string> }
      >(`notes/${note.id}/duplicate`, {
        method: "POST",
      });
      const document = remapDocument(
        current.current.document,
        new Map(Object.entries(result.attachmentMap)),
      );
      const updated = await api<Note>(`notes/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: result.revision,
          title: `${current.current.title || "Untitled"} (copy)`,
          document,
        }),
      });
      savedVersion.current = version.current;
      onSaved(updated);
      onOpen(updated);
      toast.success("Your edits were saved as a new note.");
    }, false);
  }
  async function upload(file: File) {
    await action(async () => {
      const form = new FormData();
      form.set("note", note.id);
      form.set("file", file);
      const result = await api<{ url: string; mime: string; name: string }>(
        "files",
        { method: "POST", body: form },
      );
      const type = result.mime.startsWith("image/") ? "image" : "file";
      change({
        document: {
          ...current.current.document,
          blocks: [
            ...current.current.document.blocks,
            {
              type,
              props: { url: result.url, name: result.name, caption: "" },
            },
            { type: "paragraph", content: [] },
          ],
        },
      });
      setEditorKey((n) => n + 1);
      toast.success("File attached.");
    });
  }
  const [editorKey, setEditorKey] = useState(0);
  async function saveTemplate(event: React.FormEvent) {
    event.preventDefault();
    if (!templateTitle?.trim() || templateBusy) return;
    setTemplateBusy(true);
    setTemplateError("");
    try {
      if (!(await flush()))
        throw new Error("Save your edits before creating a template.");
      const template = await api<Note>("templates", {
        method: "POST",
        body: JSON.stringify({
          sourceId: note.id,
          revision: current.current.revision,
          title: templateTitle.trim(),
        }),
      });
      setTemplateTitle(null);
      onOpen(template);
      toast.success("Template saved. Edit it here, then create notes from it.");
    } catch (e) {
      setTemplateError((e as Error).message);
    } finally {
      setTemplateBusy(false);
    }
  }
  return (
    <section className="note-pane" data-note-id={note.id}>
      <header className="note-topbar">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-back"
            aria-label="Back to notes"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
          </Button>
          <span className="breadcrumb">
            <FileText size={14} />
            Notes<span>/</span>
            <span>{note.title || "Untitled"}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`save-status ${state}`} role="status">
            {state === "saving" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : state === "saved" ? (
              <Check size={12} />
            ) : state === "error" || state === "conflict" ? (
              <AlertCircle size={12} />
            ) : null}
            {state === "saved"
              ? "Saved"
              : state === "saving"
                ? "Saving"
                : "Unsaved"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share and publish note"
            title="Share and publish"
            disabled={!!note.trashedAt}
            onClick={() => void action(async () => setSharing(true))}
          >
            <Share2 size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              note.favorite ? "Remove from favorites" : "Add to favorites"
            }
            onClick={() => change({ favorite: !note.favorite })}
            disabled={!!note.trashedAt}
          >
            <Star size={17} fill={note.favorite ? "currentColor" : "none"} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Note actions">
                <MoreHorizontal size={19} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (capturePending.current) {
                  event.preventDefault();
                  capturePending.current = false;
                  onCapture();
                }
              }}
            >
              <DropdownMenuLabel>Page width</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={note.editorWidth}
                onValueChange={(value) =>
                  change({
                    editorWidth: value === "wide" ? "wide" : "standard",
                  })
                }
              >
                <DropdownMenuRadioItem value="standard">
                  <AlignCenter size={15} />
                  Standard
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="wide">
                  <MoveHorizontal size={15} />
                  Wide
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void action(async () => setHistory(true))}
              >
                <History size={15} />
                Version history
              </DropdownMenuItem>
              {!note.trashedAt &&
                (note.kind === "template" ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() =>
                        void action(async () => {
                          const created = await api<Note>(
                            `templates/${note.id}/instantiate`,
                            { method: "POST" },
                          );
                          onOpen(created);
                        })
                      }
                    >
                      <LayoutTemplate size={15} />
                      Create note from template
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void action(async () => {
                          await api(`templates/${note.id}/daily-default`, {
                            method: "POST",
                          });
                          toast.success(
                            "New journal entries will use this template.",
                          );
                        })
                      }
                    >
                      <CalendarDays size={15} />
                      Use for journal
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onSelect={() =>
                      void action(async () => {
                        setTemplateTitle(note.title || "New template");
                        setTemplateError("");
                      })
                    }
                  >
                    <LayoutTemplate size={15} />
                    Save as template
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!!note.trashedAt}
                onSelect={() => void action(async () => setSharing(true))}
              >
                <Share2 size={15} />
                Share & publish
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void action(async () => {
                    const result = await api<Note>(
                      `notes/${note.id}/duplicate`,
                      { method: "POST" },
                    );
                    onSaved(result);
                    onOpen(result);
                  })
                }
              >
                <Copy size={15} />
                Duplicate note
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => uploadRef.current?.click()}
                disabled={!!note.trashedAt}
              >
                <Paperclip size={15} />
                Attach a file
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  capturePending.current = true;
                }}
              >
                <Inbox size={15} />
                Quick capture
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void action(async () => {
                    if (!tools.current)
                      throw new Error("The editor is still loading.");
                    await downloadRequest(
                      `export/markdown/${note.id}`,
                      `${note.title || "Untitled"}.zip`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          markdown: tools.current.markdown(),
                        }),
                      },
                    );
                  })
                }
              >
                <Download size={15} />
                Export Markdown package
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void toggleTrash()}>
                {note.trashedAt ? (
                  <>
                    <RotateCcw size={15} />
                    Restore note
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    Move to trash
                  </>
                )}
              </DropdownMenuItem>
              {note.trashedAt && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void permanentDelete()}
                >
                  <Trash2 size={15} />
                  Delete permanently
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {sharing && (
        <PublishDialog
          note={note}
          beforeAction={flush}
          onClose={() => setSharing(false)}
        />
      )}
      {history && (
        <HistoryDialog
          note={note}
          onClose={() => setHistory(false)}
          onRestore={async (id) => {
            if (!(await flush()))
              throw new Error("Save your edits before restoring a version.");
            const restored = await api<Note>(`notes/${note.id}/history/${id}`, {
              method: "POST",
              body: JSON.stringify({ revision: current.current.revision }),
            });
            onSaved(restored);
            onOpen(restored);
            toast.success(
              "Version restored. Your previous content is kept in history.",
            );
          }}
        />
      )}
      <Dialog
        open={templateTitle !== null}
        onOpenChange={(open) => {
          if (!open && !templateBusy) setTemplateTitle(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Create a reusable copy of this note, including its attachments.
          </DialogDescription>
          <form className="template-form" onSubmit={saveTemplate}>
            <Input
              aria-label="Template name"
              autoFocus
              value={templateTitle || ""}
              maxLength={300}
              disabled={templateBusy}
              onChange={(e) => setTemplateTitle(e.target.value)}
              required
            />
            {templateError && <p role="alert">{templateError}</p>}
            <Button
              type="submit"
              disabled={templateBusy || !templateTitle?.trim()}
            >
              {templateBusy ? "Saving…" : "Save template"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {error && (
        <div className="save-error" role="alert">
          <span>{error} Your edits are still here.</span>
          <div>
            {state !== "conflict" && (
              <Button size="sm" variant="outline" onClick={() => void flush()}>
                Try again
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void saveCopy()}>
              Save as new note
            </Button>
            {state === "conflict" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void (async () => {
                    if (
                      await confirm({
                        title: "Discard unsaved edits?",
                        description:
                          "Reloading replaces your local edits with the saved version.",
                        action: "Reload note",
                      })
                    )
                      await action(async () => {
                        savedVersion.current = version.current;
                        onOpen(await api<Note>(`notes/${note.id}`));
                      }, false);
                  })()
                }
              >
                Reload
              </Button>
            )}
          </div>
        </div>
      )}
      {note.trashedAt && (
        <div className="trash-banner">
          <span>This note is in trash.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleTrash()}
          >
            <RotateCcw size={14} />
            Restore
          </Button>
        </div>
      )}
      <div className="note-scroll">
        <div className="writing-surface" data-width={note.editorWidth}>
          <div className="note-date">
            {note.kind === "template" ? (
              <span className="note-kind">
                <LayoutTemplate size={14} />
                Template · Changes apply to future notes
              </span>
            ) : note.dailyDate ? (
              <span className="note-kind">
                <CalendarDays size={14} />
                Journal ·{" "}
              </span>
            ) : null}
            {new Date(note.createdAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <textarea
            ref={titleRef}
            rows={1}
            className="note-title"
            aria-label="Note title"
            value={note.title}
            onChange={(e) =>
              change({ title: e.target.value.replaceAll("\n", " ") })
            }
            placeholder="Untitled"
            maxLength={300}
            disabled={!!note.trashedAt}
          />
          <div className="note-tags">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className="tag-chip"
                data-color={
                  tags.find((item) => item.id === tag.id)?.color || tag.color
                }
              >
                <span
                  className="tag-dot"
                  data-color={
                    tags.find((item) => item.id === tag.id)?.color || tag.color
                  }
                />
                {tag.name}
                {!note.trashedAt && (
                  <button
                    aria-label={`Remove ${tag.name} tag`}
                    onClick={() =>
                      change({ tags: note.tags.filter((t) => t.id !== tag.id) })
                    }
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {!note.trashedAt && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="add-tag">
                    <TagIcon size={13} />
                    {note.tags.length ? "Add tag" : "Add tags"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {tags.length ? (
                    tags.map((tag) => (
                      <DropdownMenuItem
                        key={tag.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          change({
                            tags: note.tags.some((t) => t.id === tag.id)
                              ? note.tags.filter((t) => t.id !== tag.id)
                              : [...note.tags, tag],
                          });
                        }}
                      >
                        <span className="tag-dot" data-color={tag.color} />
                        <span className="flex-1">{tag.name}</span>
                        {note.tags.some((t) => t.id === tag.id) && (
                          <Check size={14} />
                        )}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <div className="menu-hint">
                      Create a tag in the sidebar first.
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {note.kind === "template" && !note.trashedAt && (
            <div className="template-actions">
              <Button
                size="sm"
                onClick={() =>
                  void action(async () => {
                    const created = await api<Note>(
                      `templates/${note.id}/instantiate`,
                      { method: "POST" },
                    );
                    onOpen(created);
                  })
                }
              >
                <LayoutTemplate size={15} />
                Create note from template
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void action(async () => {
                    await api(`templates/${note.id}/daily-default`, {
                      method: "POST",
                    });
                    toast.success(
                      "New journal entries will use this template.",
                    );
                  })
                }
              >
                <CalendarDays size={15} />
                Use for journal
              </Button>
            </div>
          )}
          <Editor
            key={editorKey}
            document={note.document}
            focusTerms={focusTerms}
            noteId={note.id}
            onChange={(document) => change({ document })}
            onTools={setTools}
            editable={!note.trashedAt}
            onOpenNote={onNavigateNote}
          />
          {!note.trashedAt && (
            <NoteConnections
              noteId={note.id}
              revision={note.revision}
              onOpenNote={onNavigateNote}
              onOpenItem={onNavigateItem}
            />
          )}
        </div>
      </div>
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </section>
  );
}
