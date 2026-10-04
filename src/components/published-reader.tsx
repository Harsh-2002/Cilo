"use client";
import dynamic from "next/dynamic";
import { brandPath } from "@/lib/brand";
import type { Document } from "@/lib/types";
const Editor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => (
    <div className="editor-skeleton" aria-label="Loading note">
      <span />
      <span />
      <span />
    </div>
  ),
});
const noop = () => {};
export function NoteReading({
  title,
  document,
}: {
  title: string;
  document: Document;
}) {
  const first = document.blocks[0];
  const heading = Array.isArray(first?.content)
    ? first.content
        .map((item) => (typeof item.text === "string" ? item.text : ""))
        .join("")
    : "";
  const readingDocument =
    first?.type === "heading" &&
    (first.props as { level?: number } | undefined)?.level === 1 &&
    heading.trim() === title.trim() &&
    (!Array.isArray(first.children) || first.children.length === 0)
      ? { ...document, blocks: document.blocks.slice(1) }
      : document;
  return (
    <article className="note-reading">
      <h1>{title || "Untitled"}</h1>
      <Editor
        document={readingDocument}
        onChange={noop}
        onTools={noop}
        editable={false}
        noteId=""
      />
    </article>
  );
}
export function PublishedReader({
  title,
  document,
  publishedAt,
}: {
  title: string;
  document: Document;
  publishedAt: number;
}) {
  return (
    <main className="publication-page">
      <header className="publication-header">
        <span className="publication-brand">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <rect width="40" height="40" rx="9" fill="currentColor" />
            <path d={brandPath} fill="var(--background)" />
          </svg>
          Cilo
        </span>
        <span>Shared note</span>
      </header>
      <NoteReading title={title} document={document} />
      <footer className="publication-footer">
        Published{" "}
        <time dateTime={new Date(publishedAt).toISOString()}>
          {new Date(publishedAt).toLocaleDateString("en", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </footer>
    </main>
  );
}
