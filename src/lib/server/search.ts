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
export function fuzzyCandidates(
  vocabulary: "notes" | "bookmarks" | "tasks" | "artifacts",
  word: string,
  max: number,
) {
  const database = sqlite();
  const characters = [...word];
  const pairs = new Set<string>();
  for (let i = 1; i < characters.length; i++)
    pairs.add(`${characters[i - 1]}|${characters[i]}`);
  // A middle transposition can remove every adjacent pair in a four-letter word.
  if (characters.length === 4)
    for (let i = 2; i < characters.length; i++)
      pairs.add(`${characters[i - 2]}|${characters[i]}`);
  const indexed =
    characters.length === word.length &&
    ((max === 1 && characters.length >= 4) ||
      (max === 2 && characters.length >= 8));
  const statement = indexed
    ? database.prepare(
        `SELECT s.term FROM search_terms_fts CROSS JOIN search_terms s ON s.id=search_terms_fts.rowid WHERE search_terms_fts MATCH ? AND s.vocabulary=? AND s.term_length BETWEEN ? AND ?`,
      )
    : database.prepare(
        `SELECT term FROM search_terms WHERE vocabulary=? AND term_length BETWEEN ? AND ?`,
      );
  const parameters: (string | number)[] = [
    vocabulary,
    word.length - max,
    word.length + max,
  ];
  if (indexed)
    parameters.unshift(
      [...pairs].map((pair) => `"${pair.replaceAll('"', '""')}"`).join(" OR "),
    );
  const matches: { term: string; distance: number }[] = [];
  for (const row of statement.iterate(...parameters)) {
    const { term } = row as { term: string };
    const distance = editDistance(word, term, max);
    if (distance <= max) {
      matches.push({ term, distance });
      matches.sort(
        (a, b) => a.distance - b.distance || a.term.localeCompare(b.term),
      );
      if (matches.length > 6) matches.pop();
    }
  }
  return matches;
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
        .prepare("SELECT 1 FROM search_terms WHERE vocabulary=? AND term=?")
        .get(vocabulary, word)
    )
      return `"${word}"*`;
    const matches = fuzzyCandidates(vocabulary, word, max);
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
