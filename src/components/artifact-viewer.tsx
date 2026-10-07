"use client";
import { ItemTagPicker } from "./item-tag-picker";
import { ArtifactIcon } from "./artifact-icon";
import { LoadingState } from "./loading-state";
import { useEffect, useRef, useState } from "react";
import { useCompletion } from "@/lib/completion-client";
import { FeedbackOutlet } from "./inline-feedback";
import { notify } from "@/lib/feedback";
import { Copy, Download, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { readableSize } from "@/lib/artifacts-client";
import type { Artifact, ArtifactDetail } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { useConfirm } from "./confirm-provider";
import { MediaPlayer } from "./media-player";

export const artifactLabel = (
  item: Pick<Artifact, "title" | "name" | "kind">,
) =>
  item.title ||
  item.name ||
  (item.kind === "image" ? "Untitled image" : "Untitled");
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success("Copied.");
  } catch {
    notify.error(
      "Your browser blocked copying. Select the text and copy it instead.",
    );
  }
}
export function ArtifactViewer({
  id,
  onClose,
  onChange,
  onDeleted,
}: {
  id: string | null;
  onClose: () => void;
  onChange: (item: Artifact) => void;
  onDeleted: (id: string) => void;
}) {
  const currentId = useRef(id);
  useEffect(() => {
    currentId.current = id;
    return () => {
      currentId.current = null;
    };
  }, [id]);
  const confirm = useConfirm();
  const [item, setItem] = useState<ArtifactDetail | null>(null);
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const timer = setTimeout(() => {
      setItem(null);
      setError("");
      setBusy(false);
      setDeleting(false);
      void api<ArtifactDetail>(`artifacts/${id}`)
        .then((detail) => {
          if (!active) return;
          setItem(detail);
          setTitle(detail.title);
          setDraft(detail.content);
        })
        .catch((e) => active && setError((e as Error).message));
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);
  const reading = item?.extraction === "pending";
  useCompletion("artifact", (event) => {
    if (!id || (event.target && event.target !== id)) return;
    void api<ArtifactDetail>(`artifacts/${id}`)
      .then((detail) => {
        if (currentId.current !== id) return;
        setItem((current) =>
          current
            ? {
                ...current,
                extraction: detail.extraction,
                updatedAt: detail.updatedAt,
                ...(current.kind !== "text" ? { content: detail.content } : {}),
              }
            : detail,
        );
        onChange(detail);
      })
      .catch(() => {});
  });
  async function save(changes: { title?: string; content?: string }) {
    if (!item || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<ArtifactDetail>(`artifacts/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: item.revision, ...changes }),
      });
      onChange(next);
      if (currentId.current !== next.id) return;
      setItem(next);
      setTitle(next.title);
      if (changes.content !== undefined) setDraft(next.content);
    } catch (e) {
      if (currentId.current !== item.id) notify.error((e as Error).message);
      else setError((e as Error).message);
    } finally {
      if (currentId.current === item.id) setBusy(false);
    }
  }
  async function remove() {
    if (!item) return;
    if (
      !(await confirm({
        title: "Delete this artifact?",
        description:
          "The artifact and its extracted text will move to Trash. You can restore them there.",
        action: "Delete artifact",
      }))
    )
      return;
    setBusy(true);
    setDeleting(true);
    try {
      await api(`artifacts/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ revision: item.revision }),
      });
      onDeleted(item.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setDeleting(false);
    }
  }
  async function retry() {
    if (!item || busy || reading) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Artifact>(`artifacts/${item.id}/extract`, {
        method: "POST",
      });
      if (currentId.current !== item.id) return;
      setItem((current) => (current ? { ...current, ...next } : null));
      onChange(next);
    } catch (e) {
      if (currentId.current === item.id) setError((e as Error).message);
    } finally {
      if (currentId.current === item.id) setBusy(false);
    }
  }
  async function close() {
    if (deleting) return;
    if (
      item?.kind === "text" &&
      draft.trim() !== item.content.trim() &&
      !(await confirm({
        title: "Discard your changes?",
        description: "Your saved text will stay unchanged.",
        action: "Discard changes",
      }))
    )
      return;
    onClose();
  }
  const mediaKind = item?.mime.startsWith("audio/")
    ? "audio"
    : item?.mime.startsWith("video/")
      ? "video"
      : null;
  const noun = item?.kind === "image" ? "image" : "file";
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && void close()}>
      <DialogContent className="artifact-viewer" showCloseButton={false}>
        <DialogTitle className="sr-only">
          {item ? artifactLabel(item) : "Artifact"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          View, rename, copy or delete this saved item.
        </DialogDescription>
        <header className="artifact-viewer-header">
          <div className="artifact-viewer-heading">
            {item ? (
              <>
                <Input
                  className="artifact-title"
                  aria-label="Title"
                  placeholder={
                    item.kind === "image" ? "Add a title (optional)" : "Title"
                  }
                  value={title}
                  maxLength={300}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() =>
                    title.trim() !== item.title && void save({ title })
                  }
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
                <div className="artifact-meta">
                  <span
                    className="artifact-meta-name"
                    title={item.name || undefined}
                  >
                    {item.kind === "text" ? "Text" : item.name}
                  </span>
                  {item.kind !== "text" && (
                    <span>
                      {readableSize(item.size)}
                      {item.width ? ` · ${item.width}×${item.height}` : ""}
                    </span>
                  )}
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </div>
              </>
            ) : (
              <span>Artifact</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            data-slot="dialog-close"
            aria-label="Close"
            onClick={() => void close()}
          >
            <X size={18} />
          </Button>
        </header>
        <div className="artifact-viewer-body">
          <FeedbackOutlet />
          {!item ? (
            error ? (
              <div className="artifact-viewer-loading">
                <p role="alert">{error}</p>
              </div>
            ) : (
              <LoadingState kind="viewer" label="Loading artifact" />
            )
          ) : (
            <>
              {item.kind === "image" && (
                <div className="artifact-viewer-image">
                  {/* Saved images use authenticated encrypted storage. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/nivra/artifacts/${item.id}/file`}
                    alt={artifactLabel(item)}
                  />
                </div>
              )}
              {mediaKind && (
                <MediaPlayer
                  key={item.id}
                  kind={mediaKind}
                  src={`/api/nivra/artifacts/${item.id}/file`}
                  name={item.name}
                />
              )}
              {item.kind === "file" && !mediaKind && (
                <div className="artifact-viewer-file">
                  <ArtifactIcon item={item} size={28} strokeWidth={1.4} />
                  <span>{item.mime || "File"}</span>
                </div>
              )}
              {item.kind === "text" ? (
                <Textarea
                  className="artifact-text-edit"
                  aria-label="Text"
                  value={draft}
                  disabled={busy}
                  maxLength={200000}
                  onChange={(e) => setDraft(e.target.value)}
                />
              ) : (
                (!mediaKind ||
                  reading ||
                  item.extraction === "failed" ||
                  item.content) && (
                  <section
                    className="artifact-found"
                    aria-label={`Text in this ${noun}`}
                  >
                    <div className="artifact-found-heading">
                      <h3>Text in this {noun}</h3>
                      {!mediaKind && !reading && item.extraction !== "none" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void retry()}
                        >
                          <RefreshCw size={13} />
                          {item.extraction === "failed"
                            ? "Try again"
                            : "Read again"}
                        </Button>
                      )}
                    </div>
                    {reading ? (
                      <p role="status">
                        <Loader2 size={14} className="animate-spin" /> Reading
                        text…
                      </p>
                    ) : item.extraction === "failed" ? (
                      <p role="status">
                        {item.kind === "image"
                          ? "Text could not be read reliably. Try a clearer, upright image or read it again."
                          : "Text could not be read from this file. Try reading it again."}
                      </p>
                    ) : item.content ? (
                      <pre
                        className="artifact-text"
                        tabIndex={0}
                        aria-label="Extracted text"
                      >
                        {item.content}
                      </pre>
                    ) : (
                      <p>
                        {item.kind === "image"
                          ? "No text was found in this image."
                          : "This file has no readable text."}
                      </p>
                    )}
                  </section>
                )
              )}
              {error && (
                <p className="artifact-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        {item && (
          <footer className="artifact-actions artifact-viewer-footer">
            <ItemTagPicker
              type="artifact"
              compact={false}
              id={item.id}
              title={item.title || item.name || "Untitled"}
              disabled={busy}
              onChanged={async () => {
                const detail = await api<ArtifactDetail>(
                  `artifacts/${item.id}`,
                );
                onChange(detail);
                if (currentId.current === detail.id) setItem(detail);
              }}
            />
            {item.kind === "text" && (
              <Button
                aria-label="Save changes"
                disabled={
                  busy || draft.trim() === item.content.trim() || !draft.trim()
                }
                onClick={() => void save({ content: draft })}
              >
                <span className="artifact-save-label">Save changes</span>
                <span className="artifact-save-short" aria-hidden="true">
                  Save
                </span>
              </Button>
            )}
            {(item.kind === "text" || item.content) && (
              <Button
                variant="outline"
                onClick={() => void copyText(item.content)}
              >
                <Copy size={15} />
                Copy text
              </Button>
            )}
            {item.kind !== "text" && (
              <Button variant="outline" asChild>
                <a
                  href={`/api/nivra/artifacts/${item.id}/file`}
                  download={item.name}
                >
                  <Download size={15} />
                  Download
                </a>
              </Button>
            )}
            <Button
              className="artifact-delete"
              variant="ghost"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 size={15} />
              Delete
            </Button>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
