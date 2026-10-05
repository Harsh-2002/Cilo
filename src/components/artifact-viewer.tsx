"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
    toast.success("Copied.");
  } catch {
    toast.error(
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
  // Text is read in the background, so keep asking until it is ready.
  const reading = item?.extraction === "pending";
  useEffect(() => {
    if (!id || !reading) return;
    const timer = setInterval(() => {
      void api<ArtifactDetail>(`artifacts/${id}`)
        .then((detail) => {
          setItem(detail);
          if (detail.extraction !== "pending") onChange(detail);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [id, reading, onChange]);
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
      setDraft(next.content);
    } catch (e) {
      if (currentId.current !== item.id) toast.error((e as Error).message);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!item) return;
    if (
      !(await confirm({
        title: "Delete this artifact?",
        description:
          "It is removed from Nivra, along with any text read from it.",
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
    if (!item) return;
    try {
      const next = await api<Artifact>(`artifacts/${item.id}/extract`, {
        method: "POST",
      });
      setItem({ ...item, ...next });
    } catch (e) {
      setError((e as Error).message);
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
      <DialogContent className="artifact-viewer">
        <DialogTitle className="sr-only">
          {item ? artifactLabel(item) : "Artifact"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          View, rename, copy or delete this saved item.
        </DialogDescription>
        {!item ? (
          <div className="artifact-viewer-loading" role="status">
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              <Loader2 className="animate-spin" aria-label="Loading artifact" />
            )}
          </div>
        ) : (
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
              onBlur={() => title.trim() !== item.title && void save({ title })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <p className="artifact-meta">
              {item.kind === "text"
                ? "Text"
                : `${item.name} · ${readableSize(item.size)}${item.width ? ` · ${item.width}×${item.height}` : ""}`}
              {" · "}
              {new Date(item.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
            {item.kind === "image" && (
              <div className="artifact-viewer-image">
                {/* Saved images are authenticated and encrypted at rest, so they cannot go through next/image. */}
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
                <FileText size={28} strokeWidth={1.4} />
                <span>{item.mime || "File"}</span>
              </div>
            )}
            {item.kind === "text" ? (
              <>
                <Textarea
                  className="artifact-text-edit"
                  aria-label="Text"
                  value={draft}
                  disabled={busy}
                  maxLength={200000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="artifact-actions">
                  <Button
                    disabled={
                      busy ||
                      draft.trim() === item.content.trim() ||
                      !draft.trim()
                    }
                    onClick={() => void save({ content: draft })}
                  >
                    Save changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyText(item.content)}
                  >
                    <Copy size={15} />
                    Copy text
                  </Button>
                </div>
              </>
            ) : (
              <section
                className="artifact-found"
                aria-label={`Text in this ${noun}`}
              >
                <h3>Text in this {noun}</h3>
                {reading ? (
                  <p role="status">
                    <Loader2 size={14} className="animate-spin" /> Reading text…
                  </p>
                ) : item.extraction === "failed" ? (
                  <p role="status">
                    Text could not be read from this {noun}.{" "}
                    <button
                      className="inline-action"
                      onClick={() => void retry()}
                    >
                      <RefreshCw size={13} />
                      Try again
                    </button>
                  </p>
                ) : item.content ? (
                  <pre className="artifact-text">{item.content}</pre>
                ) : (
                  <p>
                    {item.kind === "image"
                      ? "No text was found in this image."
                      : "This file has no readable text."}
                  </p>
                )}
                <div className="artifact-actions">
                  {item.content && (
                    <Button
                      variant="outline"
                      onClick={() => void copyText(item.content)}
                    >
                      <Copy size={15} />
                      Copy text
                    </Button>
                  )}
                  <Button variant="outline" asChild>
                    <a
                      href={`/api/nivra/artifacts/${item.id}/file`}
                      download={item.name}
                    >
                      <Download size={15} />
                      Download
                    </a>
                  </Button>
                </div>
              </section>
            )}
            {error && (
              <p className="artifact-error" role="alert">
                {error}
              </p>
            )}
            <div className="artifact-danger">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 size={15} />
                Delete
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
