import { sqlite } from "./db";
const cached = new WeakMap<
  ReturnType<typeof sqlite>,
  Map<string, { version: number; result: string }>
>();
export function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const unreachable = max + 1;
  let previous = new Uint16Array(b.length + 1).fill(unreachable);
  let beforePrevious = new Uint16Array(b.length + 1).fill(unreachable);
  let row = new Uint16Array(b.length + 1).fill(unreachable);
  for (let j = 0; j <= Math.min(b.length, max); j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    row.fill(unreachable);
    row[0] = Math.min(i, unreachable);
    let best = row[0];
    for (let j = Math.max(1, i - max); j <= Math.min(b.length, i + max); j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      best = Math.min(best, row[j]);
    }
    if (best > max) return unreachable;
    const spare = beforePrevious;
    beforePrevious = previous;
    previous = row;
    row = spare;
  }
  return previous[b.length];
}
export function fuzzyQuery(
  input: string,
  vocabulary: "notes" | "bookmarks" | "tasks" | "artifacts" = "notes",
) {
  const words = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu)
    ?.slice(0, 8);
  if (!words?.length || words.some((word) => word.length > 64)) return "";
  const database = sqlite();
  const { generation: version } = database
    .prepare("SELECT generation FROM search_versions WHERE vocabulary=?")
    .get(vocabulary) as { generation: number };
  let cache = cached.get(database);
  if (!cache) {
    cache = new Map();
    cached.set(database, cache);
  }
  const key = `${vocabulary}:${words.join(" ")}`;
  const cacheable = !database.inTransaction;
  const existing = cache.get(key);
  if (cacheable && existing?.version === version) return existing.result;
  let changed = false;
  const groups = words.map((word) => {
    const max = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
    if (!max) return `"${word}"*`;
    if (
      database
        .prepare(`SELECT 1 FROM ${vocabulary}_fts_vocab WHERE term=? LIMIT 1`)
        .get(word)
    )
      return `"${word}"*`;
    const candidates = database
      .prepare(
        `SELECT term FROM ${vocabulary}_fts_vocab WHERE length(term) BETWEEN ? AND ?`,
      )
      .all(word.length - max, word.length + max) as { term: string }[];
    const matches = candidates
      .map(({ term }) => ({ term, distance: editDistance(word, term, max) }))
      .filter((item) => item.distance <= max)
      .sort((a, b) => a.distance - b.distance || a.term.localeCompare(b.term))
      .slice(0, 6);
    if (matches.some((item) => item.term !== word)) changed = true;
    return matches.length
      ? `(${matches.map((item) => `"${item.term.replaceAll('"', '""')}"`).join(" OR ")})`
      : `"${word}"*`;
  });
  const result = changed ? groups.join(" AND ") : "";
  if (cacheable) {
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { version, result });
  }
  return result;
}
