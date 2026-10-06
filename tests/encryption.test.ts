import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  deriveKey,
  isEncrypted,
  masterKey,
  seal,
  unseal,
} from "../src/lib/server/encryption";

test("authenticated file encryption rejects tampering, swapped objects, and wrong keys", () => {
  const key = randomBytes(32),
    bytes = Buffer.from("a private thought");
  const encrypted = seal(bytes, key, "object:a");
  assert.ok(isEncrypted(encrypted));
  assert.notDeepEqual(encrypted, seal(bytes, key, "object:a"));
  assert.deepEqual(unseal(encrypted, key, "object:a"), bytes);
  assert.throws(() => unseal(encrypted, key, "object:b"), /authentication/);
  assert.throws(
    () => unseal(encrypted, randomBytes(32), "object:a"),
    /authentication/,
  );
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => unseal(tampered, key, "object:a"), /authentication/);
  assert.throws(() => unseal(bytes, key, "object:a"), /encrypted/);
});

test("existing SQLite, FTS, tasks, attachments and auth secrets migrate without data loss", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-encryption-"));
  process.env.NIVRA_DATA_DIR = directory;
  const file = path.join(directory, "nivra.sqlite");
  const owner = randomUUID(),
    note = randomUUID(),
    attachment = randomUUID();
  const payload = Buffer.from("private attachment sentinel");
  let connection: Database.Database | undefined;
  const clear = () => {
    connection?.close();
    connection = undefined;
    delete (globalThis as unknown as { nivraSqlite?: unknown }).nivraSqlite;
  };
  try {
    const legacy = new Database(file);
    legacy.exec(
      "CREATE TABLE migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql") && n < "0006")
      .sort()) {
      legacy.exec(await readFile(path.join("migrations", name), "utf8"));
      legacy
        .prepare("INSERT INTO migrations VALUES(?,?)")
        .run(name, Date.now());
    }
    legacy
      .prepare(
        "INSERT INTO user(id,name,email,created_at,updated_at,username) VALUES(?,?,?,?,?,?)",
      )
      .run(owner, "Owner", "owner@local.test", 1, 1, "owner");
    legacy
      .prepare(
        "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        note,
        owner,
        "encryption sentinel",
        JSON.stringify({ schemaVersion: 1, blocks: [] }),
        "private indexed text",
        1,
        1,
      );
    legacy
      .prepare(
        "INSERT INTO tasks(id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), owner, "private task sentinel", 1, 1);
    legacy
      .prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)")
      .run(
        attachment,
        note,
        "file.txt",
        "application/octet-stream",
        payload.length,
        attachment,
        1,
      );
    legacy.pragma("journal_mode=WAL");
    legacy.close();
    await mkdir(path.join(directory, "uploads"));
    await writeFile(path.join(directory, "uploads", attachment), payload);
    const oldSecret =
      "legacy-secret-sentinel-" + randomBytes(48).toString("hex");
    await writeFile(path.join(directory, "auth.secret"), oldSecret);
    const { sqlite } = await import("../src/lib/server/db");
    const { migrateStoredFiles, storage } =
      await import("../src/lib/server/storage");
    connection = sqlite();
    assert.equal(
      (
        connection
          .prepare(
            "SELECT count(*) AS n FROM notes_fts WHERE notes_fts MATCH ?",
          )
          .get("encryption") as { n: number }
      ).n,
      1,
    );
    assert.equal(
      (connection.prepare("SELECT title FROM tasks").get() as { title: string })
        .title,
      "private task sentinel",
    );
    await migrateStoredFiles();
    assert.deepEqual(await storage.read(attachment), payload);
    assert.ok(
      isEncrypted(await readFile(path.join(directory, "uploads", attachment))),
    );
    assert.equal(
      (
        connection
          .prepare("SELECT count(*) AS n FROM encryption_pending_files")
          .get() as { n: number }
      ).n,
      0,
    );
    connection
      .prepare("INSERT INTO encryption_pending_files VALUES(?)")
      .run(attachment);
    clear();
    connection = sqlite();
    await migrateStoredFiles();
    assert.deepEqual(await storage.read(attachment), payload);
    assert.equal(
      (
        connection
          .prepare("SELECT count(*) AS n FROM encryption_pending_files")
          .get() as { n: number }
      ).n,
      0,
    );
    connection.prepare("UPDATE tasks SET title=?").run("private WAL sentinel");
    assert.equal(
      (await readFile(`${file}-wal`)).includes(
        Buffer.from("private WAL sentinel"),
      ),
      false,
    );
    (await import("../src/lib/server/auth")).auth();
    const key = masterKey(directory);
    assert.equal(
      unseal(
        await readFile(path.join(directory, "auth.secret")),
        key,
        "auth-secret",
      ).toString(),
      oldSecret,
    );
    connection.pragma("wal_checkpoint(TRUNCATE)");
    const stored = await readFile(file);
    assert.notEqual(stored.subarray(0, 16).toString(), "SQLite format 3\0");
    assert.equal(stored.includes(Buffer.from("encryption sentinel")), false);
    assert.equal(stored.includes(Buffer.from("private task sentinel")), false);
    if (process.platform !== "win32")
      assert.equal(
        (await stat(path.join(directory, "encryption.key"))).mode & 0o777,
        0o600,
      );
    clear();
    connection = sqlite();
    assert.equal(connection.pragma("integrity_check", { simple: true }), "ok");
    clear();
    const unkeyed = new Database(file);
    assert.throws(() => unkeyed.prepare("SELECT * FROM notes").all());
    unkeyed.close();
    process.env.NIVRA_ENCRYPTION_ENABLED = "false";
    assert.throws(sqlite, /conflicts/);
    delete process.env.NIVRA_ENCRYPTION_ENABLED;
    const modeFile = path.join(directory, "encryption-mode.json");
    await writeFile(modeFile, JSON.stringify({ version: 1, encrypted: false }));
    assert.throws(sqlite);
    await writeFile(modeFile, JSON.stringify({ version: 1, encrypted: true }));
    process.env.NIVRA_ENCRYPTION_KEY = "00".repeat(32);
    assert.throws(sqlite);
    delete process.env.NIVRA_ENCRYPTION_KEY;
    await unlink(path.join(directory, "encryption.key"));
    assert.throws(sqlite, /key is missing/);
    await assert.rejects(readFile(path.join(directory, "encryption.key")));
    await writeFile(path.join(directory, "encryption.key"), key, {
      mode: 0o600,
    });
    connection = sqlite();
    assert.equal(connection.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(
      deriveKey(key, "files").equals(deriveKey(key, "sqlite")),
      false,
    );
  } finally {
    clear();
    delete process.env.NIVRA_ENCRYPTION_ENABLED;
    delete process.env.NIVRA_ENCRYPTION_KEY;
    await rm(directory, { recursive: true, force: true });
  }
});
