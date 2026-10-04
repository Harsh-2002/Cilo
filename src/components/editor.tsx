"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import {
  BlockNoteEditor,
  BlockNoteSchema,
  type PartialBlock,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/shadcn";
import { syntaxHighlighter } from "@blocknote/code-block";
import {
  createReactDiagramBlockSpec,
  locales as diagramLocales,
  getDiagramSlashMenuItems,
} from "@blocknote/diagram-block";
import * as locales from "@blocknote/core/locales";
import { PencilLine, Download, Table2, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { codeBlockSpec } from "./code-block";
import { download } from "@/lib/client";
import type { Document } from "@/lib/types";
import "@blocknote/shadcn/style.css";

const CanvasDialog = dynamic(() => import("./canvas-dialog"), {
  ssr: false,
  loading: () => (
    <div className="canvas-loading">
      <Loader2 className="animate-spin" />
      Opening drawing tools…
    </div>
  ),
});
function CanvasPreview({
  scene,
  preview,
  onChange,
}: {
  scene: string;
  preview: string;
  onChange: (scene: string, preview: string) => void;
}) {
  const [open, setOpen] = useState(false);
  async function exportDrawing() {
    const data = JSON.parse(
      scene ||
        '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}',
    );
    for (const file of Object.values(data.files || {}) as {
      dataURL?: string;
      attachmentId?: string;
    }[]) {
      if (file.attachmentId) {
        const blob = await fetch(`/api/cilo/files/${file.attachmentId}`).then(
          (r) => r.blob(),
        );
        file.dataURL = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
        delete file.attachmentId;
      }
    }
    download(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
      "drawing.excalidraw",
    );
  }
  return (
    <div className="drawing-block" contentEditable={false}>
      <button
        className="drawing-preview"
        onClick={() => setOpen(true)}
        aria-label="Edit drawing"
      >
        {preview ? (
          <img src={preview} alt="Drawing preview" />
        ) : (
          <span>
            <PencilLine size={28} />A blank canvas for your ideas
            <span>Click to start drawing</span>
          </span>
        )}
      </button>
      <div className="drawing-actions">
        <span>
          <PencilLine size={14} />
          Drawing
        </span>
        <Button size="sm" variant="ghost" onClick={exportDrawing}>
          <Download size={14} />
          Download
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Edit drawing
        </Button>
      </div>
      {open && (
        <CanvasDialog
          scene={scene}
          onClose={() => setOpen(false)}
          onSave={(data, image) => {
            onChange(data, image);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
const canvasSpec = createReactBlockSpec(
  {
    type: "canvas",
    propSchema: { scene: { default: "" }, preview: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }) =>
      editor.isEditable ? (
        <CanvasPreview
          scene={block.props.scene}
          preview={block.props.preview}
          onChange={(scene, preview) =>
            editor.updateBlock(block, { props: { scene, preview } })
          }
        />
      ) : (
        <div className="drawing-block">
          {block.props.preview ? (
            <img src={block.props.preview} alt="Drawing" />
          ) : (
            <p>Drawing preview unavailable</p>
          )}
        </div>
      ),
    toExternalHTML: ({ block }) => (
      <div>
        {block.props.preview ? (
          <img src={block.props.preview} alt="Drawing" />
        ) : (
          <p>Drawing</p>
        )}
      </div>
    ),
  },
);
export const editorSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    codeBlock: codeBlockSpec,
    diagram: createReactDiagramBlockSpec(),
    canvas: canvasSpec(),
  },
});
type Blocks = PartialBlock<
  typeof editorSchema.blockSchema,
  typeof editorSchema.inlineContentSchema,
  typeof editorSchema.styleSchema
>[];
export async function markdownDocument(markdown: string): Promise<Document> {
  const editor = BlockNoteEditor.create({ schema: editorSchema });
  const blocks = editor.tryParseMarkdownToBlocks(markdown);
  editor.replaceBlocks(editor.document, blocks);
  return {
    schemaVersion: 1,
    blocks: editor.document as unknown as Document["blocks"],
  };
}
export type EditorTools = { markdown: () => string };
export default function Editor({
  document,
  onChange,
  onTools,
  editable,
  noteId,
}: {
  document: Document;
  onChange: (document: Document) => void;
  onTools: (tools: EditorTools) => void;
  editable: boolean;
  noteId: string;
}) {
  const { resolvedTheme } = useTheme();
  const editor = useCreateBlockNote({
    schema: editorSchema,
    domAttributes: {
      editor: {
        "aria-label": editable ? "Note content" : "Shared note content",
        "aria-multiline": "true",
      },
    },
    initialContent: document.blocks as Blocks,
    extensions: [syntaxHighlighter],
    dictionary: { ...locales.en, diagram: diagramLocales.en },
    uploadFile: async (file) => {
      const form = new FormData();
      form.set("file", file);
      form.set("note", noteId);
      const result = await fetch("/api/cilo/files", {
        method: "POST",
        body: form,
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      return data.url;
    },
  });
  useEffect(() => {
    const element = editor.domElement;
    if (!element) return;
    // BlockNote's suggestion menu adds aria-expanded to a textbox, where it is invalid.
    const normalize = () => element.removeAttribute("aria-expanded");
    normalize();
    const observer = new MutationObserver(normalize);
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, [editor]);
  useEffect(() => {
    onTools({
      markdown: () => {
        const convert = (blocks: typeof editor.document): string =>
          blocks
            .map((block) => {
              if (block.type === "canvas")
                return `${block.props.preview ? `![Drawing](${block.props.preview})\n\n` : ""}[Editable drawing](drawings/${block.id}.excalidraw)\n\n`;
              return editor.blocksToMarkdownLossy([block]);
            })
            .join("\n");
        return convert(editor.document);
      },
    });
  }, [editor, onTools]);
  const insert = (type: "canvas" | "codeBlock" | "diagram" | "table") => {
    const current = editor.getTextCursorPosition().block;
    const defaults =
      type === "diagram"
        ? { content: "flowchart LR\n  Idea --> Note\n  Note --> Action" }
        : type === "table"
          ? {
              content: {
                type: "tableContent" as const,
                rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }],
              },
            }
          : {};
    editor.insertBlocks(
      [{ type, ...defaults } as Blocks[number]],
      current,
      "after",
    );
    editor.focus();
  };
  return (
    <div className="editor-root">
      {editable && (
        <div className="insert-toolbar" aria-label="Insert a block">
          <Button variant="ghost" size="sm" onClick={() => insert("canvas")}>
            <PencilLine size={15} />
            Drawing
          </Button>
          <Button variant="ghost" size="sm" onClick={() => insert("table")}>
            <Table2 size={15} />
            Table
          </Button>
        </div>
      )}
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        editable={editable}
        formattingToolbar={editable}
        sideMenu={editable}
        slashMenu={false}
        onChange={() =>
          onChange({
            schemaVersion: 1,
            blocks: editor.document as unknown as Document["blocks"],
          })
        }
      >
        {editable && (
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor),
                  ...getDiagramSlashMenuItems(editor),
                  {
                    title: "Drawing",
                    subtext: "Sketch on a freeform canvas",
                    group: "Artifacts",
                    icon: <PencilLine size={18} />,
                    aliases: ["canvas", "excalidraw", "draw"],
                    onItemClick: () => insert("canvas"),
                  },
                ],
                query,
              )
            }
          />
        )}
      </BlockNoteView>
    </div>
  );
}
