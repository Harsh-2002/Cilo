import type { Document } from "./types";

export function readerUrl(value: unknown, media = false): string | undefined {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value)) return;
  if (
    /^\/api\/cilo\/(?:files\/[a-f0-9-]{36}|published\/[a-f0-9]{48}\/files\/[a-f0-9-]{36})$/.test(
      value,
    )
  )
    return value;
  if (!media && /^#[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      ["https:", "http:"].includes(url.protocol) ||
      (!media && url.protocol === "mailto:")
    )
      return value;
  } catch {}
}

export function readerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(readerText).join("");
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  return typeof item.text === "string" ? item.text : readerText(item.content);
}

export function readingBlocks(title: string, document: Document) {
  const first = document.blocks[0];
  return first?.type === "heading" &&
    (first.props as { level?: number })?.level === 1 &&
    readerText(first.content).trim() === title.trim() &&
    (!Array.isArray(first.children) || !first.children.length)
    ? document.blocks.slice(1)
    : document.blocks;
}
