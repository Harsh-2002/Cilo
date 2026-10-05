import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { masterKey, deriveKey } from "../src/lib/server/encryption";
test("connected-workspace migration preserves existing encrypted notes and backfills task search and links", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cilo-upgrade-"));
  process.env.CILO_DATA_DIR = directory;
  const connection = new Database(path.join(directory, "cilo.sqlite"));
  connection.pragma("cipher='chacha20'");
  connection.pragma(
    `key='${deriveKey(masterKey(directory), "sqlite").toString("hex")}'`,
  );
  connection.exec(
    "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)",
  );
  for (const name of (await readdir("migrations"))
    .filter((n) => n < "0008")
    .sort()) {
    connection.exec(await readFile(path.join("migrations", name), "utf8"));
    connection
      .prepare("INSERT INTO migrations VALUES(?,?)")
      .run(name, Date.now());
  }
  const owner = randomUUID(),
    target = randomUUID(),
    source = randomUUID(),
    task = randomUUID();
  connection
    .prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .run(owner, "Upgrade Owner", "upgrade@local.invalid", "upgrade", 1, 1);
  const insert = connection.prepare(
    "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  );
  insert.run(
    target,
    owner,
    "Existing target",
    '{"schemaVersion":1,"blocks":[{"type":"paragraph","content":[]}]}',
    "",
    1,
    1,
  );
  insert.run(
    source,
    owner,
    "Existing source",
    JSON.stringify({
      schemaVersion: 1,
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "link",
              href: `/?note=${target}`,
              content: [{ type: "text", text: "Existing target", styles: {} }],
            },
          ],
        },
      ],
    }),
    "Existing target",
    1,
    1,
  );
  connection
    .prepare(
      "INSERT INTO tasks(id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
    )
    .run(task, owner, "Legacy task indexing", 1, 1);
  connection.close();
  const { sqlite } = await import("../src/lib/server/db");
  try {
    const migrated = sqlite();
    assert.equal(
      (
        migrated
          .prepare("SELECT editor_width FROM notes WHERE id=?")
          .get(source) as { editor_width: string }
      ).editor_width,
      "standard",
    );
    assert.equal(
      (
        migrated.prepare("SELECT kind FROM notes WHERE id=?").get(source) as {
          kind: string;
        }
      ).kind,
      "note",
    );
    assert.equal(
      (
        migrated
          .prepare(
            "SELECT count(*) AS n FROM note_links WHERE source_id=? AND target_id=?",
          )
          .get(source, target) as { n: number }
      ).n,
      1,
    );
    assert.equal(
      migrated
        .prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'indexing'")
        .all().length,
      1,
    );
    assert.equal(
      (
        migrated
          .prepare("SELECT due_date AS due FROM tasks WHERE id=?")
          .get(task) as { due: null }
      ).due,
      null,
    );
    assert.equal(migrated.pragma("integrity_check", { simple: true }), "ok");
    assert.notEqual(
      (await readFile(path.join(directory, "cilo.sqlite")))
        .subarray(0, 16)
        .toString(),
      "SQLite format 3\0",
    );
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
