import type { Document } from "@/lib/types";
import { readingBlocks } from "@/lib/reader";
import { NoteContent } from "./note-content";

export function NoteReading({
  title,
  document,
}: {
  title: string;
  document: Document;
}) {
  return (
    <article className="note-reading">
      <h1>{title || "Untitled"}</h1>
      <NoteContent blocks={readingBlocks(title, document)} />
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
        <span>Shared note</span>
        <time dateTime={new Date(publishedAt).toISOString()}>
          {new Date(publishedAt).toLocaleDateString("en", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </header>
      <NoteReading title={title} document={document} />
    </main>
  );
}
