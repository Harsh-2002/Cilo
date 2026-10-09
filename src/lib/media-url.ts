import type { Document } from "./types";
export function mediaUrl(value: string, token?: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      typeof window !== "undefined" &&
      url.origin === window.location.origin &&
      /^\/api\/v1\/files\/[a-f0-9-]{36}$/.test(url.pathname)
    )
      return url.pathname + url.search;
    if (url.username || url.password || value.length > 4096) return "";
    return `/api/v1/${token ? `published/${token}/` : ""}media?url=${encodeURIComponent(url.href)}`;
  } catch {
    return "";
  }
}

export function hasPublishedMedia(document: unknown, value: string): boolean {
  if (Array.isArray(document))
    return document.some((item) => hasPublishedMedia(item, value));
  if (!document || typeof document !== "object") return false;
  const block = document as { type?: string; props?: Record<string, unknown> };
  if (["image", "video", "audio", "canvas"].includes(block.type || "")) {
    const source = block.props?.[block.type === "canvas" ? "preview" : "url"];
    if (source === value) return true;
    if (typeof source === "string" && source.startsWith("/api/v1/published/")) {
      const url = new URL(source, "https://nivra.invalid");
      if (
        url.pathname.endsWith("/media") &&
        url.searchParams.get("url") === value
      )
        return true;
    }
  }
  return Object.values(document).some((item) => hasPublishedMedia(item, value));
}

export function publicationMedia(document: Document, token: string): Document {
  const result = structuredClone(document);
  const visit = (blocks: Document["blocks"]) => {
    for (const block of blocks) {
      if (["image", "video", "audio", "canvas"].includes(String(block.type))) {
        const key = block.type === "canvas" ? "preview" : "url";
        const props = block.props as Record<string, unknown> | undefined;
        if (props && typeof props[key] === "string")
          props[key] = mediaUrl(props[key] as string, token);
      }
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(result.blocks);
  return result;
}
