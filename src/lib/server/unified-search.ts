import { randomUUID } from "node:crypto";
import { decodeMatches } from "../search-context";
import { sqlite } from "./db";
import { ftsQuery } from "./validation";
import { fuzzyQuery } from "./search";
import type { SearchResult } from "../types";
export function parseSearch(input: string) {
  let type = "";
  let tag = "";
  const text = input
    .replace(
      /\b(type|tag):(?:"([^"]+)"|([^\s]+))/gi,
      (match, key: string, quoted: string, plain: string) => {
        const value = quoted || plain;
        if (
          key.toLowerCase() === "type" &&
          /^(notes?|tasks?|bookmarks?)$/i.test(value)
        ) {
          type = value.toLowerCase().replace(/s$/, "");
          return "";
        }
        if (key.toLowerCase() === "tag") {
          tag = value;
          return "";
        }
        return match;
      },
    )
    .trim();
  return { type, tag, text };
}
export function searchWorkspace(owner: string, input: string): SearchResult[] {
  const { type, tag, text } = parseSearch(input);
  const database = sqlite();
  const results: SearchResult[] = [];
  for (const area of ["note", "task", "bookmark"] as const) {
    if ((type && type !== area) || (tag && area !== "note")) continue;
    const table =
      area === "note" ? "notes" : area === "task" ? "tasks" : "bookmarks";
    const conditions = ["owner_id=?"];
    const params: (string | number)[] = [owner];
    if (area === "note") conditions.push("trashed_at IS NULL AND kind='note'");
    if (tag) {
      conditions.push(
        "EXISTS(SELECT 1 FROM note_tags nt JOIN tags t ON t.id=nt.tag_id WHERE nt.note_id=notes.id AND t.name=? COLLATE NOCASE)",
      );
      params.push(tag);
    }
    const run = (query: string) => {
      const where = [...conditions];
      const values = [...params];
      if (query) {
        where.push(
          `rowid IN(SELECT rowid FROM ${table}_fts WHERE ${table}_fts MATCH ?)`,
        );
        values.push(query);
      }
      const excerpt =
        area === "note" ? "text" : area === "task" ? "title" : "description";
      const completed =
        area === "task" ? ",completed_at IS NOT NULL AS completed" : "";
      return database
        .prepare(
          `SELECT rowid AS searchRow,id,title,${query ? "''" : `substr(replace(${excerpt},char(10),' '),1,180)`} AS excerpt,updated_at AS updatedAt${completed} FROM ${table} INDEXED BY ${table}_search_order_idx WHERE ${where.join(" AND ")} ORDER BY updated_at DESC,id LIMIT 12`,
        )
        .all(...values) as (Omit<SearchResult, "type"> & {
        searchRow: number;
      })[];
    };
    const context = (
      rows: (Omit<SearchResult, "type"> & { searchRow: number })[],
      query: string,
    ) => {
      const start = `[[${randomUUID()}]]`;
      const end = `[[/${randomUUID()}]]`;
      const statement = query
        ? database.prepare(
            `SELECT highlight(${table}_fts,0,?,?) AS title,snippet(${table}_fts,-1,?,?,'…',24) AS excerpt FROM ${table}_fts WHERE rowid=? AND ${table}_fts MATCH ?`,
          )
        : null;
      return rows.map(({ searchRow, ...row }) => {
        if (!statement) return row;
        const marked = statement.get(
          start,
          end,
          start,
          end,
          searchRow,
          query,
        ) as { title: string; excerpt: string };
        const title = decodeMatches(marked.title, start, end);
        const excerpt = decodeMatches(marked.excerpt, start, end);
        return {
          ...row,
          title: title.text,
          excerpt: excerpt.text,
          titleMatches: title.ranges,
          excerptMatches: excerpt.ranges,
          matchTerms: [
            ...new Set(
              excerpt.ranges.map(([from, to]) => excerpt.text.slice(from, to)),
            ),
          ].slice(0, 20),
        };
      });
    };
    const query = ftsQuery(text);
    if (text && !query) continue;
    let usedQuery = query;
    let found = run(query);
    if (!found.length && query) {
      const fuzzy = fuzzyQuery(text, table as "notes" | "tasks" | "bookmarks");
      if (fuzzy) {
        found = run(fuzzy);
        usedQuery = fuzzy;
      }
    }
    results.push(
      ...context(found, usedQuery).map((r) => ({
        ...r,
        type: area,
        ...(area === "task" ? { completed: Boolean(r.completed) } : {}),
      })),
    );
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
}
