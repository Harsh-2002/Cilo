import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { sqlite } from "./db";
import { HttpError } from "./http";
import { completionEvent } from "./jobs";
import { ftsQuery } from "./validation";
import type { Tag, TaggedItem } from "../types";

export const taggedTypes = [
  "note",
  "task",
  "bookmark",
  "artifact",
  "event",
  "form",
] as const;
export type TaggedType = (typeof taggedTypes)[number];
const tables = {
  note: "notes",
  task: "tasks",
  bookmark: "bookmarks",
  artifact: "artifacts",
  event: "calendar_events",
  form: "forms",
} as const;
export function itemTags(type: TaggedType, id: string): Tag[] {
  return sqlite()
    .prepare(
      `SELECT t.id,t.name,t.color FROM tags t JOIN ${type}_tags it ON it.tag_id=t.id WHERE it.${type}_id=? ORDER BY t.name`,
    )
    .all(id) as Tag[];
}
export function itemTagState(owner: string, type: TaggedType, id: string) {
  const row = sqlite()
    .prepare(
      `SELECT revision FROM ${tables[type]} WHERE id=? AND owner_id=? AND trashed_at IS NULL`,
    )
    .get(id, owner) as { revision: number } | undefined;
  if (!row) throw new HttpError(404, "This item was not found.");
  return { revision: row.revision, tags: itemTags(type, id) };
}
export function assignItemTags(
  owner: string,
  type: TaggedType,
  id: string,
  revision: number,
  tags: string[],
) {
  const d = sqlite();
  return d
    .transaction(() => {
      const current = itemTagState(owner, type, id);
      if (current.revision !== revision)
        throw new HttpError(
          409,
          "This item changed. Reload its tags and try again.",
        );
      const unique = [...new Set(tags)];
      for (const tag of unique)
        if (!d.prepare("SELECT 1 FROM tags WHERE id=?").get(tag))
          throw new HttpError(400, "A selected tag no longer exists.");
      d.prepare(`DELETE FROM ${type}_tags WHERE ${type}_id=?`).run(id);
      const insert = d.prepare(
        `INSERT INTO ${type}_tags(${type}_id,tag_id) VALUES(?,?)`,
      );
      for (const tag of unique) insert.run(id, tag);
      d.prepare(
        `UPDATE ${tables[type]} SET revision=revision+1,updated_at=? WHERE id=? AND owner_id=?`,
      ).run(Date.now(), id, owner);
      completionEvent(
        owner,
        "content",
        id,
        type === "form" ? "forms" : "changed",
      );
      return itemTagState(owner, type, id);
    })
    .immediate();
}
export function importItemTags(
  type: TaggedType,
  id: string,
  tags: Pick<Tag, "name" | "color">[],
) {
  const d = sqlite();
  for (const tag of tags) {
    d.prepare("INSERT OR IGNORE INTO tags(id,name,color) VALUES(?,?,?)").run(
      randomUUID(),
      tag.name,
      tag.color,
    );
    const stored = d
      .prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE")
      .get(tag.name) as { id: string };
    d.prepare(
      `INSERT OR IGNORE INTO ${type}_tags(${type}_id,tag_id) VALUES(?,?)`,
    ).run(id, stored.id);
  }
}
export function taggedItems(
  owner: string,
  tag: string,
  query: string,
  limit: number,
  offset: number,
) {
  return collectionItems(owner, query, limit, offset, tag);
}
export function favoriteItems(
  owner: string,
  query: string,
  limit: number,
  offset: number,
) {
  return collectionItems(owner, query, limit, offset);
}
function collectionItems(
  owner: string,
  query: string,
  limit: number,
  offset: number,
  tag?: string,
) {
  const d = sqlite();
  return d.transaction(() => {
    if (tag && !d.prepare("SELECT 1 FROM tags WHERE id=?").get(tag))
      throw new HttpError(404, "This tag was not found.");
    const search = ftsQuery(query);
    if (query.trim() && !search) return { items: [], next: null };
    const values: (string | number)[] = [];
    const types = tag ? taggedTypes : (["note", "bookmark", "form"] as const);
    const readers = new Map<string, Database.Statement>();
    const unions = types.map((type) => {
      const table = tables[type];
      const fts = type === "event" ? "events_fts" : `${table}_fts`;
      const excerpt =
        type === "note"
          ? "substr(i.text,1,180)"
          : type === "bookmark" || type === "form"
            ? "substr(i.description,1,180)"
            : "''";
      const title =
        type === "artifact"
          ? "coalesce(nullif(i.name,''),nullif(i.title,''),'Untitled')"
          : "i.title";
      if (tag) values.push(tag);
      values.push(owner);
      if (search) values.push(search);
      const predicate = `${tag ? `i.id IN(SELECT ${type}_id FROM ${type}_tags WHERE tag_id=?) AND` : "i.favorite=1 AND"} i.owner_id=? AND i.trashed_at IS NULL ${type === "note" ? "AND i.kind='note'" : ""} ${search ? `AND i.rowid IN (SELECT rowid FROM ${fts} WHERE ${fts} MATCH ?)` : ""}`;
      readers.set(
        type,
        d.prepare(
          `SELECT '${type}' AS type,i.id,${title} AS title,${excerpt} AS excerpt,i.updated_at AS updatedAt,${type === "note" ? "i.daily_date" : "NULL"} AS dailyDate,${type === "note" || type === "bookmark" || type === "form" ? "i.favorite" : "0"} AS favorite,${type === "task" ? "i.completed_at IS NOT NULL" : "0"} AS completed FROM ${table} i WHERE i.id=? AND i.owner_id=? AND i.trashed_at IS NULL`,
        ),
      );
      return `SELECT '${type}' AS type,i.id,i.updated_at AS updatedAt FROM ${table} i INDEXED BY ${tag ? `${table}_search_order_idx` : `${table}_favorites_order_idx`} WHERE ${predicate}`;
    });
    const candidates = d
      .prepare(
        `${unions.join(" UNION ALL ")} ORDER BY updatedAt DESC,type,id LIMIT ? OFFSET ?`,
      )
      .all(...values, limit + 1, offset) as { id: string; type: string }[];
    const rows = candidates.map(
      (row) =>
        readers.get(row.type)!.get(row.id, owner) as Omit<TaggedItem, "tags">,
    );
    const selected = rows.slice(0, limit);
    const linked = new Map<string, Tag[]>();
    for (const type of taggedTypes) {
      const ids = selected
        .filter((row) => row.type === type)
        .map((row) => row.id);
      if (!ids.length) continue;
      const tags = d
        .prepare(
          `SELECT it.${type}_id AS itemId,t.id,t.name,t.color FROM ${type}_tags it JOIN tags t ON t.id=it.tag_id WHERE it.${type}_id IN (${ids.map(() => "?").join(",")}) ORDER BY t.name`,
        )
        .all(...ids) as (Tag & { itemId: string })[];
      for (const { itemId, ...tag } of tags) {
        const key = `${type}:${itemId}`;
        linked.set(key, [...(linked.get(key) || []), tag]);
      }
    }
    return {
      items: selected.map((row) => ({
        ...row,
        favorite: Boolean(row.favorite),
        completed: Boolean(row.completed),
        tags: linked.get(`${row.type}:${row.id}`) || [],
      })),
      next: rows.length > limit ? offset + limit : null,
    };
  })();
}
