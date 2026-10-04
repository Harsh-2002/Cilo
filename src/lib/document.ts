import type { Document } from "./types";

export function remapDocument(
  document: Document,
  files: ReadonlyMap<string, string>,
): Document {
  const visit = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, visit(item, name)]),
      );
    if (typeof value !== "string") return value;
    if (key === "scene" && value)
      return JSON.stringify(visit(JSON.parse(value)));
    if (key === "attachmentId") return files.get(value) || value;
    if (["url", "href", "preview"].includes(key))
      return value.replace(
        /^\/api\/cilo\/files\/([a-f0-9-]{36})(?=[?#]|$)/,
        (url, id: string) =>
          files.has(id) ? `/api/cilo/files/${files.get(id)}` : url,
      );
    return value;
  };
  return visit(document) as Document;
}
