import { sqlite } from "./db";

export function matchingRows(
  fts: string,
  query: string,
  alias: string,
  index: string,
) {
  const rows = sqlite()
    .prepare(`SELECT rowid FROM ${fts} WHERE ${fts} MATCH ? LIMIT 513`)
    .all(query) as { rowid: number }[];
  if (rows.length <= 512)
    return {
      index: " NOT INDEXED",
      condition: rows.length
        ? `${alias}.rowid IN (${rows.map(() => "?").join(",")})`
        : "0=1",
      values: rows.map((row) => row.rowid) as (string | number)[],
    };
  return {
    index: ` INDEXED BY ${index}`,
    condition: `${alias}.rowid IN(SELECT rowid FROM ${fts} WHERE ${fts} MATCH ?)`,
    values: [query] as (string | number)[],
  };
}
