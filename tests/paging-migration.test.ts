import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { masterKey, deriveKey } from "../src/lib/server/encryption";
test("paging migration keeps existing tasks and bookmarks and the paged queries use its indexes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-paging-upgrade-"));
  process.env.NIVRA_DATA_DIR = directory;
  const connection = new Database(path.join(directory, "nivra.sqlite"));
  connection.pragma("cipher='chacha20'");
  connection.pragma(
    `key='${deriveKey(masterKey(directory), "sqlite").toString("hex")}'`,
  );
  connection.exec(
    "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)",
  );
  for (const name of (await readdir("migrations"))
    .filter((n) => n < "0012")
    .sort()) {
    connection.exec(await readFile(path.join("migrations", name), "utf8"));
    connection
      .prepare("INSERT INTO migrations VALUES(?,?)")
      .run(name, Date.now());
  }
  const owner = randomUUID();
  connection
    .prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .run(owner, "Upgrade Owner", "paging@local.invalid", "paging", 1, 1);
  const task = connection.prepare(
    "INSERT INTO tasks(id,owner_id,title,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  );
  const bookmark = connection.prepare(
    "INSERT INTO bookmarks(id,owner_id,url,title,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  );
  connection.transaction(() => {
    for (let i = 0; i < 200; i++) {
      task.run(
        randomUUID(),
        owner,
        `Existing task ${i}`,
        i % 3 ? null : "2026-10-20",
        i,
        i,
      );
      bookmark.run(
        randomUUID(),
        owner,
        `https://example.invalid/${i}`,
        `Existing ${i}`,
        i,
        i,
      );
    }
  })();
  connection.close();
  const { sqlite } = await import("../src/lib/server/db");
  const { listTaskPage, taskCounts } = await import("../src/lib/server/tasks");
  const { listBookmarkPage, bookmarkSummary } =
    await import("../src/lib/server/bookmarks");
  try {
    const database = sqlite();
    assert.ok(
      database
        .prepare("SELECT 1 FROM migrations WHERE name LIKE '0012%'")
        .get(),
    );
    assert.deepEqual(taskCounts(owner), { open: 200, completed: 0 });
    assert.equal(bookmarkSummary(owner, {}).total, 200);
    let after: string | null = null;
    let seen = 0;
    do {
      const page: { items: unknown[]; next: string | null } = listTaskPage(
        owner,
        { filter: "open", query: "", today: "2026-10-05", limit: 60, after },
      );
      seen += page.items.length;
      after = page.next;
    } while (after);
    assert.equal(seen, 200);
    assert.equal(listBookmarkPage(owner, { limit: 60 }).items.length, 60);
    const plan = (query: string) =>
      (
        database.prepare(`EXPLAIN QUERY PLAN ${query}`).all(owner) as {
          detail: string;
        }[]
      )
        .map((row) => row.detail)
        .join("\n");
    assert.match(
      plan(
        "SELECT id FROM tasks t WHERE t.owner_id=? AND t.completed_at IS NULL ORDER BY COALESCE(t.due_date,'9999'),t.created_at,t.id LIMIT 61",
      ),
      /tasks_page_idx/,
    );
    assert.match(
      plan(
        "SELECT id FROM bookmarks b WHERE b.owner_id=? ORDER BY b.created_at DESC,b.id LIMIT 61",
      ),
      /bookmarks_page_idx/,
    );
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
