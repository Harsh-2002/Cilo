import { api } from "./client";
import type { Document, Note, Settings } from "./types";
export type ImportResult = { name: string; ok: boolean; error?: string };
export function importPath(name: string, base = "") {
  let decoded: string;
  try {
    decoded = decodeURIComponent(name.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded)) return null;
  const parts: string[] = [];
  for (const part of `${decoded.startsWith("/") ? "" : base}/${decoded}`
    .replaceAll("\\", "/")
    .split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
const markdown = (name: string) => /\.(md|markdown|txt)$/i.test(name);
export async function importFiles(
  files: File[],
  parse: (text: string) => Promise<Document>,
  progress: (results: ImportResult[], current: string) => void,
) {
  const settings = await api<Settings>("settings");
  if (files.length > 100) throw new Error("Choose up to 100 files per import.");
  const paths = new Map(
    files.map((file) => [
      importPath(file.webkitRelativePath || file.name)!,
      file,
    ]),
  );
  if (paths.size !== files.length)
    throw new Error(
      "Some files have the same path. Import them in separate batches.",
    );
  const used = new Set<File>();
  const results: ImportResult[] = [];
  const upload = async (file: File, noteId: string) => {
    if (file.size > settings.uploadLimit)
      throw new Error(`${file.name} exceeds the server’s attachment limit.`);
    const form = new FormData();
    form.set("file", file);
    form.set("note", noteId);
    return api<{ url: string; mime: string; name: string }>("files", {
      method: "POST",
      body: form,
    });
  };
  const importOne = async (file: File, isMarkdown: boolean) => {
    progress([...results], file.name);
    let note: Note | undefined;
    try {
      if (isMarkdown && file.size > 8 * 1024 * 1024)
        throw new Error("Markdown files must be smaller than 8 MiB.");
      let document: Document = isMarkdown
        ? await parse(await file.text())
        : { schemaVersion: 1, blocks: [] };
      note = await api<Note>("notes", {
        method: "POST",
        body: JSON.stringify({
          title: isMarkdown
            ? file.name.replace(/\.(md|markdown|txt)$/i, "")
            : file.name,
        }),
      });
      const completed = new Map<File, string>();
      if (isMarkdown) {
        const fullPath = importPath(file.webkitRelativePath || file.name)!;
        const base = fullPath.includes("/")
          ? fullPath.slice(0, fullPath.lastIndexOf("/"))
          : "";
        const rewrite = async (value: unknown, key = ""): Promise<unknown> => {
          if (Array.isArray(value)) {
            const items: unknown[] = [];
            for (const item of value) items.push(await rewrite(item));
            return items;
          }
          if (value && typeof value === "object") {
            const entries: [string, unknown][] = [];
            for (const [name, item] of Object.entries(value))
              entries.push([name, await rewrite(item, name)]);
            return Object.fromEntries(entries);
          }
          if (typeof value !== "string" || !["url", "href"].includes(key))
            return value;
          const resolved = importPath(value, base);
          const resource = resolved ? paths.get(resolved) : undefined;
          if (!resource || markdown(resource.name)) return value;
          if (!completed.has(resource))
            completed.set(resource, (await upload(resource, note!.id)).url);
          return completed.get(resource)!;
        };
        document = (await rewrite(document)) as Document;
      } else {
        const uploaded = await upload(file, note.id);
        document = {
          schemaVersion: 1,
          blocks: [
            {
              type: uploaded.mime.startsWith("image/") ? "image" : "file",
              props: { name: file.name, url: uploaded.url, caption: "" },
            },
          ],
        };
      }
      await api<Note>(`notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: note.revision, document }),
      });
      for (const resource of completed.keys()) used.add(resource);
      results.push({ name: file.name, ok: true });
    } catch (error) {
      if (note) {
        await api(`notes/${note.id}`, {
          method: "PATCH",
          body: JSON.stringify({ revision: note.revision, trashed: true }),
        })
          .then(() => api(`notes/${note!.id}`, { method: "DELETE" }))
          .catch(() => {});
      }
      results.push({
        name: file.name,
        ok: false,
        error: (error as Error).message,
      });
    }
    progress([...results], "");
  };
  for (const file of files.filter((file) => markdown(file.name)))
    await importOne(file, true);
  for (const file of files.filter(
    (file) => !markdown(file.name) && !used.has(file),
  ))
    await importOne(file, false);
  return results;
}
