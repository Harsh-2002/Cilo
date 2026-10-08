import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("bounded unified search preserves order, matched context, tags and owner isolation across large collections", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-search-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { searchWorkspace } = await import("../src/lib/server/unified-search");
  const d = sqlite();
  try {
    d.prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('owner','Owner','search@local.invalid','owner',1,1)",
    ).run();
    d.prepare(
      "INSERT INTO tags(id,name,color) VALUES('research','Research topic','gray')",
    ).run();
    d.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        const text = `${"Unrelated paragraph. ".repeat(40)} résuméneedle${i} discoveryterm`;
        d.prepare(
          "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,'owner',?,'{}',?,1,?)",
        ).run(`note-${i}`, `Research ${i}`, text, i * 4 + 1);
        d.prepare(
          "INSERT INTO tasks(id,owner_id,title,created_at,updated_at) VALUES(?,'owner',?,1,?)",
        ).run(`task-${i}`, `discoveryterm task ${i}`, i * 4 + 2);
        d.prepare(
          "INSERT INTO bookmarks(id,owner_id,url,title,description,created_at,updated_at) VALUES(?,'owner',?,?,?,1,?)",
        ).run(
          `bookmark-${i}`,
          `https://example.com/${i}`,
          `Research link ${i}`,
          text,
          i * 4 + 3,
        );
        d.prepare(
          "INSERT INTO artifacts(id,owner_id,kind,title,content,created_at,updated_at) VALUES(?,'owner','text',?,?,1,?)",
        ).run(`artifact-${i}`, `Research artifact ${i}`, text, i * 4 + 4);
        if (i % 2 === 0)
          d.prepare(
            "INSERT INTO note_tags(note_id,tag_id) VALUES(?,'research')",
          ).run(`note-${i}`);
      }
    }).immediate();
    const { listNotes } = await import("../src/lib/server/notes");
    const params = new URLSearchParams({
      view: "all",
      preview: "1",
      limit: "60",
    });
    assert.equal(listNotes(params, undefined, "owner").length, 60);
    assert.deepEqual(listNotes(params, undefined, "someone-else"), []);
    const plan = d
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id,title FROM notes WHERE owner_id=? AND kind='note' AND trashed_at IS NULL ORDER BY updated_at DESC,id LIMIT 60",
      )
      .all("owner") as { detail: string }[];
    assert.ok(
      plan.some(
        (row) =>
          row.detail.includes("SEARCH") && row.detail.includes("owner_id=?"),
      ),
    );
    assert.ok(!plan.some((row) => row.detail.includes("TEMP B-TREE")));
    const results = searchWorkspace("owner", "discoveryterm");
    assert.equal(results.length, 30);
    assert.equal(new Set(results.map((r) => `${r.type}:${r.id}`)).size, 30);
    assert.ok(
      results.every((r, i) => !i || results[i - 1].updatedAt >= r.updatedAt),
    );
    assert.deepEqual(
      new Set(results.map((r) => r.type)),
      new Set(["note", "task", "bookmark", "artifact"]),
    );
    for (const result of results) {
      const table = {
        note: "notes",
        task: "tasks",
        bookmark: "bookmarks",
        artifact: "artifacts",
        event: "calendar_events",
      }[result.type];
      const stored = d
        .prepare(`SELECT title FROM ${table} WHERE id=?`)
        .get(result.id) as { title: string };
      assert.equal(result.title, stored.title);
      assert.ok(!("searchRow" in result));
      assert.ok(result.excerptMatches?.length);
      assert.ok(result.matchTerms?.some((t) => t === "discoveryterm"));
      assert.ok(result.excerpt.length < 500);
    }
    const deep = searchWorkspace("owner", "type:note résuméneedle999");
    assert.equal(deep[0].id, "note-999");
    assert.ok(deep[0].excerpt.includes("résuméneedle999"));
    const tagged = searchWorkspace(
      "owner",
      'type:note tag:"Research topic" discoveryterm',
    );
    assert.equal(tagged.length, 12);
    assert.ok(
      tagged.every(
        (r) => r.type === "note" && Number(r.id.split("-")[1]) % 2 === 0,
      ),
    );
    assert.deepEqual(searchWorkspace("someone-else", "discoveryterm"), []);
    d.prepare(
      "UPDATE artifacts SET trashed_at=1 WHERE id='artifact-999'",
    ).run();
    assert.ok(
      !searchWorkspace("owner", "discoveryterm").some(
        (r) => r.id === "artifact-999",
      ),
    );
    assert.equal(d.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    d.close();
    await rm(directory, { recursive: true, force: true });
  }
});
