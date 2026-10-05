import { sqlite } from "./db";
const cached = new WeakMap<
  ReturnType<typeof sqlite>,
  { version: string; queries: Map<string, string> }
>();
export function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
    }
    if (Math.min(...row) > max) return max + 1;
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length];
}
export function fuzzyQuery(
  input: string,
  vocabulary: "notes" | "bookmarks" | "tasks" = "notes",
) {
  const words = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu)
    ?.slice(0, 8);
  if (!words?.length || words.some((word) => word.length > 64)) return "";
  const database = sqlite();
  const changes = database.prepare("SELECT total_changes() AS n").get() as {
    n: number;
  };
  const version = `${changes.n}:${database.pragma("data_version", { simple: true })}`;
  let cache = cached.get(database);
  if (!cache || cache.version !== version) {
    cache = { version, queries: new Map() };
    cached.set(database, cache);
  }
  const key = `${vocabulary}:${words.join(" ")}`;
  if (cache.queries.has(key)) return cache.queries.get(key)!;
  let changed = false;
  const groups = words.map((word) => {
    const max = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
    if (!max) return `"${word}"*`;
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
  if (cache.queries.size >= 128)
    cache.queries.delete(cache.queries.keys().next().value!);
  cache.queries.set(key, result);
  return result;
}
