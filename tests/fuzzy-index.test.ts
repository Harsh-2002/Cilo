import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("indexed vocabulary candidates matches exhaustive typo results including transpositions and Unicode", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-fuzzy-index-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { fuzzyCandidates, editDistance, fuzzyQuery } =
    await import("../src/lib/server/search");
  const d = sqlite();
  try {
    d.prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('owner','Test','test@example.invalid','owner',1,1)",
    ).run();
    const words = [
      "milestone",
      "milestnoe",
      "milsetone",
      "milsetnoe",
      "abdc",
      "badc",
      "abcd",
      "resume",
      "résumé",
      "東京大学",
      "大学東京",
      "😀abcdefghi",
      "ab😀cdefghi",
      "👾abcdefghi",
      "abcdefgh",
      "badcfegh",
      "zyxwvuts",
      "concurrency",
      "neubla",
      "nebula",
    ];
    let seed = 31;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 3000; i++)
      words.push(
        Array.from(
          { length: 4 + ((random() >>> 24) % 9) },
          () => "abcdefghijklmnop"[(random() >>> 16) % 16],
        ).join(""),
      );
    d.prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES('n','owner','Test','{}',?,1,1)",
    ).run(words.join(" "));
    const terms = d.prepare("SELECT term FROM notes_fts_vocab").all() as {
      term: string;
    }[];
    for (const word of [
      ...words.slice(0, 21),
      "xxxx",
      "xxxxxxxx",
      "abcdefghijkl",
      "東京大字",
      "milestonz",
      "concurency",
      ...words.slice(21, 80),
      ...words.slice(21, 100).map((word) => {
        const letters = [...word];
        [letters[0], letters[1]] = [letters[1], letters[0]];
        if (word.length >= 8)
          [letters[letters.length - 2], letters[letters.length - 1]] = [
            letters[letters.length - 1],
            letters[letters.length - 2],
          ];
        return letters.join("");
      }),
    ]) {
      const max = word.length >= 8 ? 2 : 1;
      const expected = terms
        .filter(
          ({ term }) =>
            [...term].length >= word.length - max &&
            [...term].length <= word.length + max,
        )
        .map(({ term }) => ({ term, distance: editDistance(word, term, max) }))
        .filter((row) => row.distance <= max)
        .sort((a, b) => a.distance - b.distance || a.term.localeCompare(b.term))
        .slice(0, 6);
      assert.deepEqual(fuzzyCandidates("notes", word, max), expected, word);
    }
    const verifyTerms = () => {
      for (const vocabulary of ["notes", "tasks", "bookmarks", "artifacts"]) {
        assert.deepEqual(
          d
            .prepare(
              "SELECT term,documents FROM search_terms WHERE vocabulary=? ORDER BY term",
            )
            .all(vocabulary),
          d
            .prepare(
              `SELECT term,doc AS documents FROM ${vocabulary}_fts_vocab WHERE length(term) BETWEEN 3 AND 66 ORDER BY term`,
            )
            .all(),
          vocabulary,
        );
        assert.equal(
          (
            d
              .prepare(
                `SELECT count(*) AS n FROM ${vocabulary}_term_tokens_vocab`,
              )
              .get() as { n: number }
          ).n,
          0,
        );
      }
      d.exec(
        "INSERT INTO search_terms_fts(search_terms_fts,rank) VALUES('integrity-check',1)",
      );
    };
    verifyTerms();
    d.prepare(
      "INSERT INTO tasks(id,owner_id,title,created_at,updated_at) VALUES('t','owner','résumé shared shared',1,1)",
    ).run();
    d.prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,description,collection,created_at,updated_at) VALUES('b','owner','https://example.invalid/shared','résumé shared','shared repeated','shared',1,1)",
    ).run();
    d.prepare(
      "INSERT INTO artifacts(id,owner_id,kind,title,content,name,created_at,updated_at) VALUES('a','owner','text','résumé shared','shared repeated','shared.txt',1,1)",
    ).run();
    verifyTerms();
    for (const [table, column, id] of [
      ["notes", "text", "n"],
      ["tasks", "title", "t"],
      ["bookmarks", "description", "b"],
      ["artifacts", "content", "a"],
    ]) {
      assert.throws(
        () =>
          d.transaction(() => {
            d.prepare(
              `UPDATE ${table} SET ${column}='replacement rollback' WHERE id=?`,
            ).run(id);
            verifyTerms();
            throw new Error("rollback");
          })(),
        /rollback/,
      );
      verifyTerms();
      const snapshot = d
        .prepare("SELECT * FROM search_terms ORDER BY id")
        .all();
      d.prepare(
        `UPDATE ${table} SET ${column}=${column},updated_at=42 WHERE id=?`,
      ).run(id);
      assert.deepEqual(
        d.prepare("SELECT * FROM search_terms ORDER BY id").all(),
        snapshot,
      );
    }
    const before = fuzzyQuery("milestonz");
    const version = () =>
      (
        d
          .prepare(
            "SELECT generation FROM search_versions WHERE vocabulary='notes'",
          )
          .get() as { generation: number }
      ).generation;
    const generation = version();
    d.prepare("UPDATE notes SET favorite=1,updated_at=2 WHERE id='n'").run();
    assert.equal(version(), generation);
    assert.equal(fuzzyQuery("milestonz"), before);
    d.prepare("UPDATE notes SET text='milestonz' WHERE id='n'").run();
    assert.ok(version() > generation);
    assert.equal(fuzzyQuery("milestonz"), "");
    verifyTerms();
    for (const [table, id] of [
      ["notes", "n"],
      ["tasks", "t"],
      ["bookmarks", "b"],
      ["artifacts", "a"],
    ]) {
      d.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      verifyTerms();
    }
    assert.equal(
      (
        d.prepare("SELECT count(*) AS n FROM search_terms").get() as {
          n: number;
        }
      ).n,
      0,
    );
    assert.equal(d.pragma("quick_check", { simple: true }), "ok");
  } finally {
    d.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("four-letter typo pair filter covers substitutions, insertions, deletions and transpositions", async () => {
  const { editDistance } = await import("../src/lib/server/search");
  const words = (length: number): string[] =>
    length
      ? words(length - 1).flatMap((prefix) =>
          [..."abc"].map((letter) => prefix + letter),
        )
      : [""];
  const candidates = [3, 4, 5].flatMap(words);
  for (const word of words(4)) {
    const pairs = new Set([
      word[0] + word[1],
      word[1] + word[2],
      word[2] + word[3],
      word[0] + word[2],
      word[1] + word[3],
    ]);
    for (const candidate of candidates)
      if (editDistance(word, candidate, 1) <= 1)
        assert.ok(
          [...candidate].some(
            (letter, index) =>
              index > 0 && pairs.has(candidate[index - 1] + letter),
          ),
          `${word}:${candidate}`,
        );
  }
});
