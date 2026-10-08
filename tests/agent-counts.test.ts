import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
test("agent counts are exact beyond page size, separate journals, filter tags/favorites/Trash and isolate owners", async () => {
  const directory = await mkdtemp(`${tmpdir()}/nivra-agent-counts-`);
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { agentCounts } = await import("../src/lib/server/agent-counts");
  const { agentSearch } = await import("../src/lib/server/agent-search");
  const database = sqlite(),
    owner = randomUUID(),
    tag = randomUUID(),
    now = Date.now();
  try {
    database
      .prepare(
        "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .run(owner, "Test", "test@nivra.invalid", "test", now, now);
    database.prepare("INSERT INTO tags(id,name) VALUES(?,?)").run(tag, "Audit");
    database.transaction(() => {
      for (let i = 0; i < 68; i++) {
        const id = randomUUID();
        database
          .prepare(
            "INSERT INTO notes(id,owner_id,title,document,kind,daily_date,favorite,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            owner,
            "Count fixture",
            JSON.stringify({ schemaVersion: 1, blocks: [] }),
            i === 67 ? "template" : "note",
            i === 65 ? "2026-01-01" : null,
            i < 3 ? 1 : 0,
            i === 66 ? now : null,
            now + i,
            now + i,
          );
        if (i < 2)
          database
            .prepare("INSERT INTO note_tags(note_id,tag_id) VALUES(?,?)")
            .run(id, tag);
      }
      for (let i = 0; i < 3; i++) {
        const id = randomUUID();
        database
          .prepare(
            "INSERT INTO tasks(id,owner_id,title,completed_at,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            id,
            owner,
            "Task",
            i === 1 ? now : null,
            i === 2 ? now : null,
            now,
            now,
          );
        if (i === 0)
          database
            .prepare("INSERT INTO task_tags(task_id,tag_id) VALUES(?,?)")
            .run(id, tag);
      }
      database
        .prepare(
          "INSERT INTO bookmarks(id,owner_id,url,title,favorite,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          owner,
          "https://example.com",
          "Bookmark",
          1,
          now,
          now,
        );
      const artifact = randomUUID();
      database
        .prepare(
          "INSERT INTO artifacts(id,owner_id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .run(artifact, owner, "text", "Artifact", now, now);
      database
        .prepare("INSERT INTO artifact_tags(artifact_id,tag_id) VALUES(?,?)")
        .run(artifact, tag);
    })();
    const active = agentCounts(owner, {
      state: "active",
      favoritesOnly: false,
    });
    assert.deepEqual(active.counts, {
      notes: 65,
      journals: 1,
      tasks: 2,
      bookmarks: 1,
      artifacts: 1,
      events: 0,
    });
    assert.equal(active.total, 70);
    assert.deepEqual(active.taskStatus, { open: 1, completed: 1 });
    assert.equal(active.exact, true);
    const matches = agentSearch(owner, {
      query: "type:note Count",
      limit: 50,
      offset: 0,
    });
    assert.equal(matches.total, 65);
    assert.equal(matches.items.length, 50);
    assert.equal(matches.nextOffset, 50);
    const remainder = agentSearch(owner, {
      query: "type:note Count",
      limit: 50,
      offset: 50,
    });
    assert.equal(remainder.items.length, 15);
    assert.equal(remainder.nextOffset, null);
    assert.equal(
      agentSearch(owner, { query: "type:journal Count", limit: 50, offset: 0 })
        .total,
      1,
    );
    assert.equal(
      agentSearch(owner, { query: "tag:Audit", limit: 50, offset: 0 }).total,
      4,
    );
    assert.equal(
      agentSearch("another-owner", { query: "Count", limit: 50, offset: 0 })
        .total,
      0,
    );
    assert.equal(
      agentSearch(owner, {
        query: "type:note no-matching-token",
        limit: 50,
        offset: 0,
      }).total,
      0,
    );
    assert.deepEqual(
      agentCounts(owner, { state: "trash", favoritesOnly: false }).counts,
      {
        notes: 1,
        journals: 0,
        tasks: 1,
        bookmarks: 0,
        artifacts: 0,
        events: 0,
      },
    );
    assert.equal(
      agentCounts(owner, { state: "active", favoritesOnly: true }).total,
      4,
    );
    assert.deepEqual(
      agentCounts(owner, { state: "active", favoritesOnly: false, tagId: tag })
        .counts,
      {
        notes: 2,
        journals: 0,
        tasks: 1,
        bookmarks: 0,
        artifacts: 1,
        events: 0,
      },
    );
    assert.equal(
      agentCounts("another-owner", { state: "active", favoritesOnly: false })
        .total,
      0,
    );
    assert.throws(
      () =>
        agentCounts(owner, {
          state: "active",
          favoritesOnly: false,
          tagId: randomUUID(),
        }),
      (error: unknown) => (error as { status: number }).status === 404,
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
