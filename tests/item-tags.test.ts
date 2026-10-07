import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { readFile, readdir } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("universal tag migration preserves existing notes and tag relationships", async () => {
  const d = new Database(":memory:");
  try {
    for (const file of (await readdir("migrations"))
      .filter((file) => file.endsWith(".sql") && file < "0017")
      .sort())
      d.exec(await readFile(path.join("migrations", file), "utf8"));
    d.exec(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('owner','Owner','upgrade@local.invalid','upgrade',1,1); INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES('note','owner','Preserved','{}','Unchanged',1,1); INSERT INTO tags(id,name,color) VALUES('tag','Existing','gray'); INSERT INTO note_tags VALUES('note','tag')",
    );
    d.exec(await readFile("migrations/0017_tags_all_items.sql", "utf8"));
    assert.deepEqual(d.prepare("SELECT note_id,tag_id FROM note_tags").all(), [
      { note_id: "note", tag_id: "tag" },
    ]);
    assert.deepEqual(d.prepare("SELECT title,text,revision FROM notes").get(), {
      title: "Preserved",
      text: "Unchanged",
      revision: 1,
    });
    for (const table of ["task_tags", "bookmark_tags", "artifact_tags"])
      assert.equal(
        (
          d.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
            count: number;
          }
        ).count,
        0,
      );
    assert.equal(d.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    d.close();
  }
});

test("tags organize every item type with authorized revision checks, search, paging and cascade cleanup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-item-tags-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const d = sqlite();
  const {
    assignItemTags,
    itemTagState,
    itemTags,
    taggedItems,
    favoriteItems,
    importItemTags,
  } = await import("../src/lib/server/item-tags");
  const { searchWorkspace } = await import("../src/lib/server/unified-search");
  const { createTask, updateTask } = await import("../src/lib/server/tasks");
  const owner = randomUUID(),
    tag = randomUUID(),
    second = randomUUID();
  try {
    d.prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,'Owner','tags@local.invalid','tags',1,1)",
    ).run(owner);
    d.prepare(
      "INSERT INTO tags(id,name,color) VALUES(?,'Organized','gray'),(?,'Work','gray')",
    ).run(tag, second);
    const ids: {
      type: "note" | "task" | "bookmark" | "artifact";
      id: string;
    }[] = [];
    for (let i = 0; i < 75; i++) {
      for (const type of ["note", "task", "bookmark", "artifact"] as const) {
        const id = randomUUID();
        ids.push({ type, id });
        if (type === "note")
          d.prepare(
            "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at,daily_date) VALUES(?,?,?,'{}','deepneedle',1,?,?)",
          ).run(
            id,
            owner,
            `Note ${i}`,
            i * 4 + 1,
            i === 0 ? "2026-10-07" : null,
          );
        if (type === "task")
          d.prepare(
            "INSERT INTO tasks(id,owner_id,title,created_at,updated_at,completed_at) VALUES(?,?,?,1,?,?)",
          ).run(
            id,
            owner,
            `deepneedle task ${i}`,
            i * 4 + 2,
            i === 0 ? 1 : null,
          );
        if (type === "bookmark")
          d.prepare(
            "INSERT INTO bookmarks(id,owner_id,url,title,description,created_at,updated_at) VALUES(?,?,?,?,'deepneedle',1,?)",
          ).run(id, owner, `https://example.com/${i}`, `Link ${i}`, i * 4 + 3);
        if (type === "artifact")
          d.prepare(
            "INSERT INTO artifacts(id,owner_id,kind,title,content,name,created_at,updated_at) VALUES(?,?,'text',?,'deepneedle','',1,?)",
          ).run(id, owner, `Artifact ${i}`, i * 4 + 4);
        assignItemTags(owner, type, id, 1, [tag, second, tag]);
        assert.equal(itemTagState(owner, type, id).revision, 2);
        assert.equal(itemTags(type, id).length, 2);
      }
    }
    const seen = new Set<string>();
    let next: number | null = 0;
    do {
      const page = taggedItems(owner, tag, "", 60, next);
      assert.ok(page.items.length <= 60);
      for (const row of page.items) {
        assert.ok(!seen.has(row.id));
        seen.add(row.id);
        assert.equal(row.tags.length, 2);
      }
      next = page.next;
    } while (next !== null);
    assert.equal(seen.size, 300);
    const all = taggedItems(owner, tag, "deepneedle", 60, 0);
    assert.deepEqual(
      new Set(all.items.map((row) => row.type)),
      new Set(["note", "task", "bookmark", "artifact"]),
    );
    assert.ok(
      taggedItems(owner, tag, "", 60, 240).items.some((row) => row.dailyDate),
    );
    assert.ok(
      taggedItems(owner, tag, "", 60, 240).items.some(
        (row) => row.type === "task" && row.completed,
      ),
    );
    assert.deepEqual(taggedItems("other", tag, "", 60, 0).items, []);
    for (const index of [0, 2, 4, 6]) {
      const item = ids[index];
      d.prepare(
        `UPDATE ${item.type === "note" ? "notes" : "bookmarks"} SET favorite=1 WHERE id=?`,
      ).run(item.id);
    }
    const favoriteFirst = favoriteItems(owner, "", 2, 0);
    const favoriteNext = favoriteItems(owner, "", 2, favoriteFirst.next!);
    assert.equal(favoriteFirst.next, 2);
    assert.equal(favoriteNext.next, null);
    assert.equal(
      new Set(
        [...favoriteFirst.items, ...favoriteNext.items].map((item) => item.id),
      ).size,
      4,
    );
    assert.ok(
      [...favoriteFirst.items, ...favoriteNext.items].every(
        (item) => item.favorite,
      ),
    );
    assert.ok(
      [...favoriteFirst.items, ...favoriteNext.items].some(
        (item) => item.dailyDate,
      ),
    );
    assert.equal(favoriteItems(owner, "deepneedle", 60, 0).items.length, 4);
    assert.deepEqual(favoriteItems("other", "", 60, 0).items, []);
    for (const { type, id } of ids.slice(0, 4)) {
      assert.throws(() => assignItemTags("other", type, id, 2, [tag]), {
        status: 404,
      });
      assert.throws(() => assignItemTags(owner, type, id, 1, []), {
        status: 409,
      });
      assert.throws(() => assignItemTags(owner, type, id, 2, [randomUUID()]), {
        status: 400,
      });
      assert.equal(itemTags(type, id).length, 2);
      const table = {
        note: "notes",
        task: "tasks",
        bookmark: "bookmarks",
        artifact: "artifacts",
      }[type];
      d.prepare(`UPDATE ${table} SET trashed_at=1 WHERE id=?`).run(id);
      assert.ok(
        !taggedItems(owner, tag, "", 60, 240).items.some(
          (row) => row.id === id,
        ),
      );
      assert.equal(itemTags(type, id).length, 2);
      d.prepare(`UPDATE ${table} SET trashed_at=NULL WHERE id=?`).run(id);
    }
    const global = searchWorkspace(owner, "tag:Organized deepneedle");
    assert.deepEqual(
      new Set(global.map((row) => row.type)),
      new Set(["note", "task", "bookmark", "artifact"]),
    );
    assert.ok(
      global.every((row) =>
        row.matchTerms?.some((word) => word === "deepneedle"),
      ),
    );
    const recurring = createTask(owner, "Repeating", {
      dueDate: "2026-10-07",
      recurrence: "daily",
    });
    assignItemTags(owner, "task", recurring.id, recurring.revision, [tag]);
    updateTask(owner, recurring.id, { revision: 2, completed: true });
    const following = d
      .prepare("SELECT id FROM tasks WHERE parent_task_id=?")
      .get(recurring.id) as { id: string };
    assert.equal(itemTags("task", following.id)[0].id, tag);
    importItemTags("task", following.id, [{ name: "Imported", color: "gray" }]);
    assert.equal(itemTags("task", following.id).length, 2);
    for (const type of ["note", "task", "bookmark", "artifact"]) {
      const plan = d
        .prepare(
          `EXPLAIN QUERY PLAN SELECT ${type}_id FROM ${type}_tags WHERE tag_id=?`,
        )
        .all(tag) as { detail: string }[];
      assert.ok(
        plan.some((row) => row.detail.includes(`${type}_tags_tag_idx`)),
      );
    }
    d.prepare("DELETE FROM tags WHERE id=?").run(tag);
    for (const { type, id } of ids) assert.equal(itemTags(type, id).length, 1);
    assert.deepEqual(d.pragma("foreign_key_check"), []);
    assert.equal(d.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    d.close();
    await rm(directory, { recursive: true, force: true });
  }
});
