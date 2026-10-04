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
          `SELECT id,title,${excerpt} AS excerpt,updated_at AS updatedAt${completed} FROM ${table} WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 12`,
        )
        .all(...values) as Omit<SearchResult, "type">[];
    };
    const query = ftsQuery(text);
    if (text && !query) continue;
    let found = run(query);
    if (!found.length && query) {
      const fuzzy = fuzzyQuery(text, table as "notes" | "tasks" | "bookmarks");
      if (fuzzy) found = run(fuzzy);
    }
    results.push(
      ...found.map((r) => ({
        ...r,
        type: area,
        ...(area === "task" ? { completed: Boolean(r.completed) } : {}),
      })),
    );
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
}
