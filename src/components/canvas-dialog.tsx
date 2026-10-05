"use client";
import { useConfirm } from "./confirm-provider";
import { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  exportToBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  AppState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Loader2, PencilLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { api } from "@/lib/client";
import "@excalidraw/excalidraw/index.css";

export default function CanvasDialog({
  scene,
  onSave,
  onClose,
}: {
  scene: string;
  onSave: (scene: string, preview: string) => void;
  onClose: () => void;
}) {
  const [initial, setInitial] = useState<{
    elements: ExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const baseline = useRef<string | null>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    (
      window as unknown as { EXCALIDRAW_ASSET_PATH: string }
    ).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
    let active = true;
    async function load() {
      const data = JSON.parse(
        scene || '{"elements":[],"appState":{},"files":{}}',
      );
      for (const file of Object.values(data.files || {}) as {
        attachmentId?: string;
        dataURL?: string;
      }[]) {
        if (file.attachmentId) {
          const response = await fetch(`/api/nivra/files/${file.attachmentId}`);
          if (!response.ok)
            throw new Error("An image in this drawing could not be loaded.");
          const blob = await response.blob();
          file.dataURL = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          });
        }
      }
      if (active) setInitial(data);
    }
    load().catch((e) => {
      if (active) setLoadError(e.message);
    });
    return () => {
      active = false;
    };
  }, [scene]);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !initial) return;
    const labelMenu = () => {
      surface
        .querySelector(".main-menu-trigger")
        ?.setAttribute("aria-label", "Drawing menu");
    };
    labelMenu();
    const observer = new MutationObserver(labelMenu);
    observer.observe(surface, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [initial]);
  const confirm = useConfirm();
  const close = async () => {
    if (
      !dirty ||
      (await confirm({
        title: "Discard drawing changes?",
        description: "Your unsaved changes to this drawing will be lost.",
        action: "Discard changes",
      }))
    )
      onClose();
  };
  async function save() {
    if (!apiRef.current) return;
    setBusy(true);
    try {
      const noteId =
        document.querySelector<HTMLElement>("[data-note-id]")?.dataset.noteId;
      if (!noteId) throw new Error("The note is no longer open.");
      const elements = apiRef.current.getSceneElements();
      const appState = apiRef.current.getAppState();
      const files = apiRef.current.getFiles();
      const stored: Record<string, unknown> = {};
      for (const [id, file] of Object.entries(files)) {
        let attachmentId = (file as unknown as { attachmentId?: string })
          .attachmentId;
        if (!attachmentId) {
          const blob = await fetch(file.dataURL).then((r) => r.blob());
          const form = new FormData();
          form.set("note", noteId);
          form.set(
            "file",
            new File([blob], `drawing-image-${id}.png`, {
              type: file.mimeType,
            }),
          );
          attachmentId = (
            await api<{ id: string }>("files", { method: "POST", body: form })
          ).id;
        }
        stored[id] = {
          id: file.id,
          mimeType: file.mimeType,
          created: file.created,
          attachmentId,
        };
      }
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: false,
        },
        files,
        mimeType: "image/png",
        maxWidthOrHeight: 1600,
      });
      const form = new FormData();
      form.set("note", noteId);
      form.set(
        "file",
        new File([blob], "drawing-preview.png", { type: "image/png" }),
      );
      const preview = await api<{ url: string }>("files", {
        method: "POST",
        body: form,
      });
      const data = JSON.parse(
        serializeAsJSON(elements, appState, files, "local"),
      );
      data.files = stored;
      onSave(JSON.stringify(data), preview.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        className="canvas-dialog"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <header>
          <div>
            <DialogTitle>
              <PencilLine size={18} />
              Drawing
            </DialogTitle>
            <DialogDescription>
              Sketch, connect, and explore your ideas.
            </DialogDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !initial}>
              {busy && <Loader2 size={15} className="animate-spin" />}Save
              drawing
            </Button>
          </div>
        </header>
        <div className="canvas-surface" ref={surfaceRef}>
          {initial ? (
            <Excalidraw
              initialData={initial}
              excalidrawAPI={(instance) => {
                apiRef.current = instance;
              }}
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              onChange={(elements, appState, files) => {
                const value = serializeAsJSON(
                  elements,
                  appState,
                  files,
                  "local",
                );
                if (baseline.current === null) baseline.current = value;
                setDirty(value !== baseline.current);
              }}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: false,
                },
              }}
            />
          ) : loadError ? (
            <div role="alert">
              <p>{loadError}</p>
              <Button variant="outline" onClick={onClose}>
                Close drawing
              </Button>
            </div>
          ) : (
            <Loader2 className="animate-spin" aria-label="Loading drawing" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
