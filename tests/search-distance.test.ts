import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance } from "../src/lib/server/search";

test("bounded typo distance preserves substitutions, insertions, deletions and transpositions", () => {
  const distance = (a: string, b: string) => {
    const rows = Array.from({ length: a.length + 1 }, () =>
      Array<number>(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) rows[i][0] = i;
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    return rows[a.length][b.length];
  };
  const words = [
    "",
    "a",
    "b",
    "ab",
    "ba",
    "aa",
    "abc",
    "bca",
    "cab",
    "abba",
    "résumé",
    "resume",
    "milestone",
    "milestnoe",
    "interimmilestone",
  ];
  for (const a of words)
    for (const b of words)
      for (const max of [0, 1, 2])
        assert.equal(
          Math.min(editDistance(a, b, max), max + 1),
          Math.min(distance(a, b), max + 1),
          `${a}/${b}/${max}`,
        );
});
