import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { encryptionEnabled } from "../src/lib/server/encryption-mode";
import { isEncrypted } from "../src/lib/server/encryption";

test("encryption defaults on, persists the first choice and rejects changes or invalid records", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nivra-mode-"));
  try {
    assert.equal(encryptionEnabled(directory, {}), true);
    assert.equal(
      encryptionEnabled(directory, { NIVRA_ENCRYPTION_ENABLED: "true" }),
      true,
    );
    assert.throws(
      () => encryptionEnabled(directory, { NIVRA_ENCRYPTION_ENABLED: "false" }),
      /conflicts/,
    );
    assert.throws(
      () => encryptionEnabled(directory, { NIVRA_ENCRYPTION_ENABLED: "0" }),
      /true or false/,
    );
    const file = path.join(directory, "encryption-mode.json");
    if (process.platform !== "win32")
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    await writeFile(file, '{"version":1,"encrypted":"false"}');
    assert.throws(() => encryptionEnabled(directory, {}), /invalid/);
    await writeFile(file, "{");
    assert.throws(() => encryptionEnabled(directory, {}));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a pre-mode installation cannot opt out or modify existing data", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nivra-mode-existing-"),
  );
  try {
    const file = path.join(directory, "nivra.sqlite");
    await writeFile(file, Buffer.from("existing encrypted database"));
    assert.throws(
      () => encryptionEnabled(directory, { NIVRA_ENCRYPTION_ENABLED: "false" }),
      /first startup/,
    );
    assert.equal(
      (await readFile(file)).toString(),
      "existing encrypted database",
    );
    await assert.rejects(
      stat(path.join(directory, "encryption-mode.json")),
      /ENOENT/,
    );
    assert.equal(encryptionEnabled(directory, {}), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("concurrent first starts publish one complete mode and reject a conflicting choice", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nivra-mode-race-"));
  try {
    const program = `import {encryptionEnabled} from './src/lib/server/encryption-mode.ts'; encryptionEnabled(process.env.NIVRA_DATA_DIR);`;
    const starts = await Promise.allSettled(
      ["true", "false"].map((mode) =>
        promisify(execFile)(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", program],
          {
            env: {
              ...process.env,
              NIVRA_DATA_DIR: directory,
              NIVRA_ENCRYPTION_ENABLED: mode,
            },
          },
        ),
      ),
    );
    assert.equal(
      starts.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      starts.filter((result) => result.status === "rejected").length,
      1,
    );
    assert.equal(typeof encryptionEnabled(directory, {}), "boolean");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("opt-out persists across restarts and restores while auth secrets and backups stay encrypted", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nivra-mode-plain-"));
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_ENCRYPTION_ENABLED = "false";
  const { sqlite } = await import("../src/lib/server/db");
  const { storage, createStorage } = await import("../src/lib/server/storage");
  const { authSecret } = await import("../src/lib/server/auth");
  const backups = await import("../src/lib/server/backups");
  let database = sqlite();
  const owner = randomUUID(),
    note = randomUUID(),
    file = randomUUID();
  const reset = () => {
    database.close();
    delete (globalThis as unknown as { nivraSqlite?: unknown }).nivraSqlite;
  };
  try {
    database
      .prepare(
        "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .run(owner, "Fixture", "fixture@local.invalid", "fixture");
    database
      .prepare(
        "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      )
      .run(
        note,
        owner,
        "Plain fixture",
        '{"schemaVersion":1,"blocks":[]}',
        "plainsearchsentinel",
      );
    database
      .prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,1)")
      .run(file, note, "fixture.txt", "text/plain", 7, file);
    await storage.write(file, Buffer.from("payload"));
    assert.equal(
      (await readFile(path.join(directory, "uploads", file))).toString(),
      "payload",
    );
    const bytes = await storage.read(file);
    assert.equal(bytes.buffer.byteLength, bytes.length);
    const secret = authSecret();
    assert.ok(isEncrypted(await readFile(path.join(directory, "auth.secret"))));
    database.pragma("wal_checkpoint(TRUNCATE)");
    assert.equal(
      (await readFile(path.join(directory, "nivra.sqlite")))
        .subarray(0, 16)
        .toString(),
      "SQLite format 3\0",
    );
    reset();
    delete process.env.NIVRA_ENCRYPTION_ENABLED;
    database = sqlite();
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) n FROM notes_fts WHERE notes_fts MATCH 'plainsearchsentinel'",
          )
          .get() as { n: number }
      ).n,
      1,
    );
    assert.equal(authSecret(), secret);
    const backup = await backups.createBackup();
    assert.ok(
      isEncrypted(
        await readFile(path.join(directory, "backups", backup.id, "database")),
      ),
    );
    assert.ok(
      isEncrypted(
        await readFile(
          path.join(directory, "backups", backup.id, "files", file),
        ),
      ),
    );
    const target = path.join(directory, "restored");
    await backups.restoreBackup(backup.id, target);
    assert.equal(encryptionEnabled(target, {}), false);
    const restored = new Database(path.join(target, "nivra.sqlite"), {
      readonly: true,
    });
    try {
      assert.equal(
        (restored.prepare("SELECT title FROM notes").get() as { title: string })
          .title,
        "Plain fixture",
      );
    } finally {
      restored.close();
    }
    assert.deepEqual(
      await createStorage({ NIVRA_DATA_DIR: target }).read(file),
      Buffer.from("payload"),
    );
    await backups.verifyBackup(backup.id);
    reset();
    process.env.NIVRA_ENCRYPTION_ENABLED = "true";
    assert.throws(sqlite, /conflicts/);
    delete process.env.NIVRA_ENCRYPTION_ENABLED;
    database = sqlite();
  } finally {
    reset();
    delete process.env.NIVRA_ENCRYPTION_ENABLED;
    await rm(directory, { recursive: true, force: true });
  }
});
