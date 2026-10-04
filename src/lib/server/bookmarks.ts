import { randomUUID } from "node:crypto";
import { db, sqlite } from "./db";
import { bookmarks } from "./schema";
import { and, desc, eq } from "drizzle-orm";
import { storage } from "./storage";
import { HttpError } from "./http";
import { fuzzyQuery } from "./search";
import { ftsQuery } from "./validation";
import { requireLinkedNote } from "./connections";
import {
  bookmarkUrl,
  fetchPublic,
  imageMime,
  parseMetadata,
} from "./link-metadata";
import type { Bookmark } from "../types";
type Row = {
  id: string;
  owner_id: string;
  url: string;
  title: string;
  description: string;
  site_name: string;
  collection: string;
  favorite: number | boolean;
  metadata_status: "ready" | "unavailable";
  thumbnail_key: string | null;
  thumbnail_mime: string | null;
  icon_key: string | null;
  icon_mime: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
  note_id: string | null;
};
const fields = {
  id: bookmarks.id,
  owner_id: bookmarks.ownerId,
  url: bookmarks.url,
  title: bookmarks.title,
  description: bookmarks.description,
  site_name: bookmarks.siteName,
  collection: bookmarks.collection,
  favorite: bookmarks.favorite,
  metadata_status: bookmarks.metadataStatus,
  thumbnail_key: bookmarks.thumbnailKey,
  thumbnail_mime: bookmarks.thumbnailMime,
  icon_key: bookmarks.iconKey,
  icon_mime: bookmarks.iconMime,
  revision: bookmarks.revision,
  created_at: bookmarks.createdAt,
  updated_at: bookmarks.updatedAt,
  note_id: bookmarks.noteId,
};
function existing(owner: string, url: string) {
  return db()
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.ownerId, owner), eq(bookmarks.url, url)))
    .get();
}
function expose(row: Row): Bookmark {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    siteName: row.site_name,
    collection: row.collection,
    favorite: !!row.favorite,
    metadataStatus: row.metadata_status,
    thumbnail: row.thumbnail_key
      ? `/api/cilo/bookmarks/${row.id}/thumbnail`
      : null,
    icon: row.icon_key ? `/api/cilo/bookmarks/${row.id}/icon` : null,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    noteId: row.note_id,
    noteTitle: row.note_id
      ? ((
          sqlite()
            .prepare("SELECT title FROM notes WHERE id=?")
            .get(row.note_id) as { title: string } | undefined
        )?.title ?? null)
      : null,
  };
}
function need(owner: string, id: string): Row {
  const row = db()
    .select(fields)
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.ownerId, owner)))
    .get() as Row | undefined;
  if (!row) throw new HttpError(404, "This bookmark was not found.");
  return row;
}
export function listBookmarks(owner: string, query = ""): Bookmark[] {
  const term = query.trim().slice(0, 300);
  let rows = term
    ? sqlite()
        .prepare(
          `SELECT b.* FROM bookmarks b WHERE b.owner_id=? AND
    (b.rowid IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?) OR
    instr(lower(b.title || ' ' || b.description || ' ' || b.url || ' ' || b.collection),lower(?))>0)
    ORDER BY b.created_at DESC,b.id`,
        )
        .all(owner, ftsQuery(term), term)
    : db()
        .select(fields)
        .from(bookmarks)
        .where(eq(bookmarks.ownerId, owner))
        .orderBy(desc(bookmarks.createdAt), bookmarks.id)
        .all();
  if (term && !rows.length) {
    const fallback = fuzzyQuery(term, "bookmarks");
    if (fallback)
      rows = sqlite()
        .prepare(
          "SELECT b.* FROM bookmarks b WHERE b.owner_id=? AND b.rowid IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?) ORDER BY b.created_at DESC,b.id",
        )
        .all(owner, fallback);
  }
  return (rows as Row[]).map(expose);
}
async function metadata(url: string) {
  const assets: { key: string; mime: string }[] = [];
  const fallback = {
    title: new URL(url).hostname,
    description: "",
    siteName: new URL(url).hostname,
    metadataStatus: "unavailable" as "ready" | "unavailable",
    thumbnail: null as { key: string; mime: string } | null,
    icon: null as { key: string; mime: string } | null,
  };
  const signal = AbortSignal.timeout(10_000);
  try {
    const page = await fetchPublic(url, 1024 * 1024, signal);
    if (!["text/html", "application/xhtml+xml"].includes(page.type))
      return fallback;
    const info = parseMetadata(page.bytes.toString("utf8"), page.url);
    async function image(value: string) {
      if (!value) return null;
      try {
        const result = await fetchPublic(value, 2 * 1024 * 1024, signal);
        const mime = imageMime(result.bytes);
        if (!mime) return null;
        const key = randomUUID();
        await storage.write(key, result.bytes);
        const asset = { key, mime };
        assets.push(asset);
        return asset;
      } catch {
        return null;
      }
    }
    const [thumbnail, icon] = await Promise.all([
      image(info.thumbnail),
      image(info.icon),
    ]);
    return {
      ...fallback,
      title: info.title,
      description: info.description,
      siteName: info.siteName,
      metadataStatus: "ready" as const,
      thumbnail,
      icon,
    };
  } catch {
    await Promise.all(assets.map((a) => storage.delete(a.key)));
    return fallback;
  }
}
export async function createBookmark(
  owner: string,
  input: { url: string; collection: string },
): Promise<Bookmark> {
  const url = bookmarkUrl(input.url);
  if (existing(owner, url))
    throw new HttpError(
      409,
      "This link is already saved. Search your bookmarks to find it.",
    );
  const info = await metadata(url);
  const id = randomUUID();
  const now = Date.now();
  try {
    db()
      .insert(bookmarks)
      .values({
        id,
        ownerId: owner,
        url,
        title: info.title,
        description: info.description,
        siteName: info.siteName,
        collection: input.collection,
        metadataStatus: info.metadataStatus,
        thumbnailKey: info.thumbnail?.key || null,
        thumbnailMime: info.thumbnail?.mime || null,
        iconKey: info.icon?.key || null,
        iconMime: info.icon?.mime || null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (error) {
    await Promise.all(
      [info.thumbnail, info.icon]
        .filter((a) => a !== null)
        .map((a) => storage.delete(a.key)),
    );
    if (existing(owner, url))
      throw new HttpError(409, "This link is already saved.");
    throw error;
  }
  return expose(need(owner, id));
}
export function updateBookmark(
  owner: string,
  id: string,
  input: {
    revision: number;
    title?: string;
    description?: string;
    collection?: string;
    favorite?: boolean;
    noteId?: string | null;
  },
): Bookmark {
  need(owner, id);
  requireLinkedNote(owner, input.noteId);
  const { revision, ...changes } = input;
  const result = db()
    .update(bookmarks)
    .set({ ...changes, revision: revision + 1, updatedAt: Date.now() })
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.ownerId, owner),
        eq(bookmarks.revision, revision),
      ),
    )
    .run();
  if (!result.changes)
    throw new HttpError(
      409,
      "This bookmark changed in another tab. Refresh and try again.",
    );
  return expose(need(owner, id));
}
export async function refreshBookmark(
  owner: string,
  id: string,
  revision: number,
): Promise<Bookmark> {
  const before = need(owner, id);
  if (before.revision !== revision)
    throw new HttpError(409, "Refresh bookmarks before trying again.");
  const info = await metadata(before.url);
  if (info.metadataStatus === "unavailable")
    throw new HttpError(
      422,
      "This site did not provide a preview. Your saved link is unchanged; try again later or edit the details.",
    );
  const result = db()
    .update(bookmarks)
    .set({
      title: info.title,
      description: info.description,
      siteName: info.siteName,
      metadataStatus: "ready",
      thumbnailKey: info.thumbnail?.key || null,
      thumbnailMime: info.thumbnail?.mime || null,
      iconKey: info.icon?.key || null,
      iconMime: info.icon?.mime || null,
      revision: revision + 1,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.ownerId, owner),
        eq(bookmarks.revision, revision),
      ),
    )
    .run();
  if (!result.changes) {
    await Promise.all(
      [info.thumbnail, info.icon]
        .filter((a) => a !== null)
        .map((a) => storage.delete(a.key)),
    );
    throw new HttpError(
      409,
      "This bookmark changed while fetching its preview. Refresh and try again.",
    );
  }
  await Promise.all(
    [before.thumbnail_key, before.icon_key]
      .filter((k) => k !== null)
      .map((k) => storage.delete(k)),
  );
  return expose(need(owner, id));
}
export async function deleteBookmark(
  owner: string,
  id: string,
  revision: number,
) {
  const row = need(owner, id);
  if (
    !db()
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.id, id),
          eq(bookmarks.ownerId, owner),
          eq(bookmarks.revision, revision),
        ),
      )
      .run().changes
  )
    throw new HttpError(
      409,
      "This bookmark changed in another tab. Refresh and try again.",
    );
  await Promise.all(
    [row.thumbnail_key, row.icon_key]
      .filter((k) => k !== null)
      .map((k) => storage.delete(k)),
  );
}
export async function bookmarkImage(
  owner: string,
  id: string,
  kind: "thumbnail" | "icon",
) {
  const row = need(owner, id);
  const key = row[`${kind}_key`];
  if (!key) throw new HttpError(404, "This preview image was not found.");
  return new Response(new Uint8Array(await storage.read(key)), {
    headers: {
      "Content-Type": row[`${kind}_mime`] || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function exportBookmarkBundle(owner: string) {
  const rows = db()
    .select(fields)
    .from(bookmarks)
    .where(eq(bookmarks.ownerId, owner))
    .all() as Row[];
  const files: Record<string, Uint8Array> = {};
  const items = [];
  for (const row of rows) {
    for (const key of [row.thumbnail_key, row.icon_key])
      if (key) files[`files/${key}`] = await storage.read(key);
    items.push({
      url: row.url,
      title: row.title,
      description: row.description,
      siteName: row.site_name,
      collection: row.collection,
      favorite: !!row.favorite,
      metadataStatus: row.metadata_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      noteId: row.note_id,
      thumbnail: row.thumbnail_key
        ? { id: row.thumbnail_key, mime: row.thumbnail_mime }
        : null,
      icon: row.icon_key ? { id: row.icon_key, mime: row.icon_mime } : null,
    });
  }
  return { items, files };
}
