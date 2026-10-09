import { sqlite } from "./db";
import { parseSearch } from "./unified-search";
import { ftsQuery } from "./validation";
import { HttpError } from "./http";
export function agentSearch(
  owner: string,
  input: { query: string; limit: number; offset: number },
) {
  const { type, tag, text } = parseSearch(input.query);
  if (text.split(/\s+/).filter(Boolean).length > 20)
    throw new HttpError(400, "Use at most 20 search terms.");
  const search = ftsQuery(text),
    database = sqlite();
  if (text && !search) return { items: [], total: 0, nextOffset: null };
  const values: (string | number)[] = [];
  const branches = [];
  for (const [area, table, tagTable, tagColumn] of [
    ["note", "notes", "note_tags", "note_id"],
    ["task", "tasks", "task_tags", "task_id"],
    ["bookmark", "bookmarks", "bookmark_tags", "bookmark_id"],
    ["artifact", "artifacts", "artifact_tags", "artifact_id"],
    ["event", "calendar_events", "event_tags", "event_id"],
    ["form", "forms", "form_tags", "form_id"],
  ] as const) {
    if (type && type !== area && !(type === "journal" && area === "note"))
      continue;
    const where = ["i.owner_id=?", "i.trashed_at IS NULL"];
    values.push(owner);
    if (area === "note") {
      where.push("i.kind='note'");
      if (type === "note") where.push("i.daily_date IS NULL");
      if (type === "journal") where.push("i.daily_date IS NOT NULL");
    }
    if (tag) {
      where.push(
        `EXISTS(SELECT 1 FROM ${tagTable} a JOIN tags t ON t.id=a.tag_id WHERE a.${tagColumn}=i.id AND t.name=? COLLATE NOCASE)`,
      );
      values.push(tag);
    }
    const fts = area === "event" ? "events_fts" : `${table}_fts`;
    if (search) {
      where.push(`i.rowid IN(SELECT rowid FROM ${fts} WHERE ${fts} MATCH ?)`);
      values.push(search);
    }
    const kind =
      area === "note"
        ? "CASE WHEN i.daily_date IS NULL THEN 'note' ELSE 'journal' END"
        : `'${area}'`;
    const excerpt =
      area === "note"
        ? "i.text"
        : area === "task"
          ? "i.title"
          : area === "bookmark"
            ? "i.description"
            : area === "event" || area === "form"
              ? "i.description"
              : "i.content";
    branches.push(
      `SELECT i.id,${kind} AS type,i.title,substr(replace(${excerpt},char(10),' '),1,180) AS excerpt,i.revision,i.updated_at AS updatedAt,${area === "note" ? "i.daily_date" : "NULL"} AS dailyDate FROM ${table} i WHERE ${where.join(" AND ")}`,
    );
  }
  const source = branches.join(" UNION ALL ");
  return database.transaction(() => {
    const { total } = database
      .prepare(`SELECT count(*) AS total FROM (${source})`)
      .get(...values) as { total: number };
    const items = database
      .prepare(
        `SELECT * FROM (${source}) ORDER BY updatedAt DESC,type,id LIMIT ? OFFSET ?`,
      )
      .all(...values, input.limit, input.offset);
    return {
      items,
      total,
      nextOffset:
        input.offset + items.length < total
          ? input.offset + items.length
          : null,
    };
  })();
}
