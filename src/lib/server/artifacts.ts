import { moveToTrash } from "./trash";
import { randomUUID } from "node:crypto";
import { sqlite } from "./db";
import { storage } from "./storage";
import { HttpError } from "./http";
import { fuzzyQuery } from "./search";
import { ftsQuery } from "./validation";
import { decodeMatches } from "../search-context";
import { fileResponse, mediaMime } from "./file-response";
import { decodeCursor, encodeCursor } from "./pagination";
import { imageInfo, isPdf, maxTextLength } from "./extract";
import { enqueueJob, startJobWorker } from "./jobs";
import type { Artifact, ArtifactDetail, Page } from "../types";

type Row = {
  id: string;
  kind: "text" | "image" | "file";
  title: string;
  content: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  storage_key: string | null;
  thumb_key: string | null;
  extraction: Artifact["extraction"];
  revision: number;
  created_at: number;
  updated_at: number;
  excerpt?: string;
};
const columns =
  "a.id,a.kind,a.title,a.name,a.mime,a.size,a.width,a.height,a.storage_key,a.thumb_key,a.extraction,a.revision,a.created_at,a.updated_at,substr(a.content,1,600) AS content";
const thumbnailLimit = 768 * 1024;
const oneLine = (text: string, length: number) =>
  text.replace(/\s+/g, " ").trim().slice(0, length);
function expose(row: Row): Artifact {
  const matches = row.excerpt
    ? (row as Row & { excerptMatches?: Artifact["excerptMatches"] })
    : undefined;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    name: row.name,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    preview:
      row.kind === "text"
        ? row.content.slice(0, 600)
        : oneLine(row.content, 240),
    thumbnail: !!row.thumb_key,
    extraction: row.extraction,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.excerpt !== undefined
      ? { excerpt: row.excerpt, excerptMatches: matches?.excerptMatches }
      : {}),
  };
}
function need(owner: string, id: string): Row {
  const row = sqlite()
    .prepare(
      `SELECT ${columns.replace("substr(a.content,1,600) AS content", "a.content AS content")} FROM artifacts a WHERE a.id=? AND a.owner_id=? AND a.trashed_at IS NULL`,
    )
    .get(id, owner) as Row | undefined;
  if (!row) throw new HttpError(404, "This artifact was not found.");
  return row;
}
const firstLine = (text: string) =>
  oneLine(text.split("\n").find((line) => line.trim()) || "", 90);
const baseName = (name: string) => name.replace(/\.[a-z0-9]{1,8}$/i, "");

export function createTextArtifact(owner: string, text: string): Artifact {
  const content = text.replace(/\r\n?/g, "\n").trim();
  if (!content) throw new HttpError(400, "There is nothing to save.");
  if (content.length > maxTextLength)
    throw new HttpError(413, "Pasted text can be up to 200,000 characters.");
  const id = randomUUID();
  const now = Date.now();
  sqlite()
    .prepare(
      "INSERT INTO artifacts(id,owner_id,kind,title,content,size,created_at,updated_at) VALUES(?,?,'text',?,?,?,?,?)",
    )
    .run(id, owner, firstLine(content), content, content.length, now, now);
  return expose(need(owner, id));
}
export async function createFileArtifact(
  owner: string,
  file: { name: string; mime: string; bytes: Uint8Array },
  thumbnail?: Uint8Array,
): Promise<Artifact> {
  if (!file.bytes.length) throw new HttpError(400, "This file is empty.");
  const name = (file.name || "file").replace(/[\\/\0]/g, "_").slice(0, 200);
  const image = imageInfo(file.bytes);
  const kind = image ? "image" : "file";
  // The bytes decide what a file is; a declared type is only used when they are not recognised.
  const media = image ? undefined : mediaMime(file.bytes);
  const pdf = !image && !media && isPdf(file.bytes);
  const mime =
    image?.mime ||
    media ||
    (pdf ? "application/pdf" : file.mime.slice(0, 120)) ||
    "application/octet-stream";
  const read = !media && (!pdf || file.bytes.length <= 40 * 1024 * 1024);
  const keys: string[] = [];
  const id = randomUUID();
  try {
    const key = randomUUID();
    await storage.write(key, file.bytes);
    keys.push(key);
    let thumbKey: string | null = null;
    if (
      (image || media?.startsWith("video/")) &&
      thumbnail?.length &&
      thumbnail.length <= thumbnailLimit
    ) {
      const preview = imageInfo(thumbnail);
      if (preview) {
        thumbKey = randomUUID();
        await storage.write(thumbKey, thumbnail);
        keys.push(thumbKey);
      }
    }
    const now = Date.now();
    sqlite()
      .transaction(() => {
        sqlite()
          .prepare(
            "INSERT INTO artifacts(id,owner_id,kind,title,content,name,mime,size,width,height,storage_key,thumb_key,extraction,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            owner,
            kind,
            image ? "" : baseName(name),
            "",
            name,
            mime,
            file.bytes.length,
            image?.width ?? 0,
            image?.height ?? 0,
            key,
            thumbKey,
            read ? "pending" : "none",
            now,
            now,
          );
        if (read) enqueueJob(owner, "artifact", id);
      })
      .immediate();
  } catch (error) {
    await Promise.allSettled(keys.map((key) => storage.delete(key)));
    throw error;
  }
  startJobWorker();
  return expose(need(owner, id));
}
export type ArtifactQuery = { query?: string; kind?: Artifact["kind"] };
export function listArtifactPage(
  owner: string,
  options: ArtifactQuery & { limit: number; after?: string | null },
): Page<Artifact> {
  const term = (options.query || "").trim().slice(0, 300);
  const cursor = decodeCursor(options.after ?? null, ["number", "string"]);
  const run = (match?: string) => {
    const where = ["a.owner_id=?", "a.trashed_at IS NULL"];
    const values: (string | number)[] = [owner];
    if (options.kind) {
      where.push("a.kind=?");
      values.push(options.kind);
    }
    if (match !== undefined) {
      where.push(
        "a.rowid IN (SELECT rowid FROM artifacts_fts WHERE artifacts_fts MATCH ?)",
      );
      values.push(match);
    }
    if (cursor) {
      where.push("(a.created_at<? OR (a.created_at=? AND a.id>?))");
      values.push(
        cursor[0] as number,
        cursor[0] as number,
        cursor[1] as string,
      );
    }
    return database()
      .prepare(
        `SELECT ${columns} FROM artifacts a WHERE ${where.join(" AND ")} ORDER BY a.created_at DESC,a.id LIMIT ?`,
      )
      .all(...values, options.limit + 1) as Row[];
  };
  let used = term ? ftsQuery(term) : "";
  let rows = term && !used ? [] : run(term ? used : undefined);
  if (term && !rows.length && !cursor) {
    const fuzzy = fuzzyQuery(term, "artifacts");
    if (fuzzy) {
      rows = run(fuzzy);
      used = fuzzy;
    }
  }
  const items = rows.slice(0, options.limit);
  if (term && used && items.length) {
    const start = `[[${randomUUID()}]]`;
    const end = `[[/${randomUUID()}]]`;
    const statement = database().prepare(
      "SELECT snippet(artifacts_fts,-1,?,?,'…',28) AS excerpt FROM artifacts_fts WHERE rowid=(SELECT rowid FROM artifacts WHERE id=?) AND artifacts_fts MATCH ?",
    );
    for (const row of items) {
      const found = statement.get(start, end, row.id, used) as
        { excerpt: string } | undefined;
      if (!found) continue;
      const marked = decodeMatches(found.excerpt, start, end);
      Object.assign(row, {
        excerpt: marked.text,
        excerptMatches: marked.ranges,
      });
    }
  }
  const last = items[items.length - 1];
  return {
    items: items.map(expose),
    next:
      rows.length > options.limit && last
        ? encodeCursor([last.created_at, last.id])
        : null,
  };
}
const database = sqlite;
export function artifactSummary(owner: string) {
  return sqlite()
    .prepare(
      "SELECT COUNT(*) AS total,COUNT(*) FILTER (WHERE kind='image') AS images,COUNT(*) FILTER (WHERE kind='text') AS texts,COUNT(*) FILTER (WHERE kind='file') AS files FROM artifacts WHERE owner_id=? AND trashed_at IS NULL",
    )
    .get(owner) as {
    total: number;
    images: number;
    texts: number;
    files: number;
  };
}
export function getArtifact(owner: string, id: string): ArtifactDetail {
  const row = need(owner, id);
  return { ...expose(row), content: row.content };
}
export function updateArtifact(
  owner: string,
  id: string,
  input: { revision: number; title?: string; content?: string },
): ArtifactDetail {
  const row = need(owner, id);
  if (input.content !== undefined && row.kind !== "text")
    throw new HttpError(400, "Only pasted text can be edited.");
  if (input.content !== undefined && !input.content.trim())
    throw new HttpError(400, "Text artifacts cannot be empty.");
  if (input.content !== undefined && input.content.length > maxTextLength)
    throw new HttpError(413, "Pasted text can be up to 200,000 characters.");
  const content = input.content?.replace(/\r\n?/g, "\n").trim() ?? row.content;
  const title =
    input.title !== undefined
      ? input.title.trim()
      : row.kind === "text" &&
          input.content !== undefined &&
          row.title === firstLine(row.content)
        ? firstLine(content)
        : row.title;
  const changed = sqlite()
    .prepare(
      "UPDATE artifacts SET title=?,content=?,size=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?",
    )
    .run(
      title,
      content,
      row.kind === "text" ? content.length : row.size,
      Date.now(),
      id,
      owner,
      input.revision,
    ).changes;
  if (!changed)
    throw new HttpError(
      409,
      "This artifact changed in another tab. Refresh and try again.",
    );
  return getArtifact(owner, id);
}
export async function deleteArtifact(
  owner: string,
  id: string,
  revision: number,
) {
  moveToTrash(owner, "artifact", id, revision);
}
export function retryExtraction(owner: string, id: string): Artifact {
  const row = need(owner, id);
  if (row.kind === "text" || /^(audio|video)\//.test(row.mime))
    throw new HttpError(400, "This artifact does not need text extraction.");
  sqlite()
    .transaction(() => {
      need(owner, id);
      sqlite()
        .prepare(
          "UPDATE artifacts SET extraction='pending',updated_at=? WHERE id=? AND owner_id=? AND extraction!='pending'",
        )
        .run(Date.now(), id, owner);
      enqueueJob(owner, "artifact", id);
    })
    .immediate();
  startJobWorker();
  return expose(need(owner, id));
}
export async function artifactFile(
  request: Request,
  owner: string,
  id: string,
  part: "file" | "thumbnail",
) {
  const row = need(owner, id);
  const key = part === "thumbnail" ? row.thumb_key : row.storage_key;
  if (!key) throw new HttpError(404, "This file was not found.");
  const meta =
    part === "thumbnail"
      ? {
          mime:
            imageInfo(await (await storage.open(key)).read(0, 31))?.mime ||
            "image/webp",
          name: "thumbnail",
        }
      : { mime: row.mime, name: row.name || "file" };
  return fileResponse(request, await storage.open(key), meta);
}
export function artifactFileKeys(owner: string) {
  return sqlite()
    .prepare("SELECT storage_key,thumb_key FROM artifacts WHERE owner_id=?")
    .all(owner) as { storage_key: string | null; thumb_key: string | null }[];
}
