import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publishedNote } from "@/lib/server/publications";
import { PublishedReader } from "@/components/published-reader";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const note = publishedNote((await params).token);
  if (!note)
    return {
      title: "Note unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: note.title || "Untitled",
    description: note.excerpt,
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      title: note.title || "Untitled",
      description: note.excerpt,
    },
    twitter: {
      card: "summary",
      title: note.title || "Untitled",
      description: note.excerpt,
    },
  };
}
export default async function PublishedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const note = publishedNote((await params).token);
  if (!note) notFound();
  return (
    <PublishedReader
      title={note.title}
      document={note.document}
      publishedAt={note.publishedAt}
    />
  );
}
