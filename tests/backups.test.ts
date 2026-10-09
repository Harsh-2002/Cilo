import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  readdir,
  rename,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("encrypted full-instance backups preserve accounts, search, tasks, bookmarks, shares and files", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nivra-backup-test-"));
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_BACKUP_KEEP = "2";
  const { sqlite } = await import("../src/lib/server/db");
  const { masterKey, deriveKey, unseal, seal } =
    await import("../src/lib/server/encryption");
  const { storage, createStorage } = await import("../src/lib/server/storage");
  const { authSecret } = await import("../src/lib/server/auth");
  const backups = await import("../src/lib/server/backups");
  const database = sqlite();
  (
    await import("../src/lib/server/system-configuration")
  ).systemConfiguration();
  database
    .prepare("UPDATE system_configuration SET backup_keep=2 WHERE id=1")
    .run();
  const owner = randomUUID(),
    note = randomUUID(),
    file = randomUUID(),
    preview = randomUUID();
  database
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,username,created_at,updated_at) VALUES(?,?,?,0,?,?,?)",
    )
    .run(
      owner,
      "Fixture Owner",
      "fixture@local.invalid",
      "fixture",
      Date.now(),
      Date.now(),
    );
  database
    .prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      note,
      owner,
      "Backup sentinel",
      '{"schemaVersion":1,"blocks":[{"type":"paragraph","content":[]}]}',
      "Searchable recovery",
      Date.now(),
      Date.now(),
    );
  database
    .prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)")
    .run(
      file,
      note,
      "sample.bin",
      "application/octet-stream",
      7,
      file,
      Date.now(),
    );
  database
    .prepare(
      "INSERT INTO tasks(id,owner_id,title,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      owner,
      "Completed fixture",
      Date.now(),
      Date.now(),
      Date.now(),
    );
  database
    .prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,description,collection,thumbnail_key,thumbnail_mime,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      owner,
      "https://example.com/",
      "Saved example",
      "Bookmark sentinel",
      "Reading",
      preview,
      "image/png",
      Date.now(),
      Date.now(),
    );
  await storage.write(file, Buffer.from("payload"));
  await storage.write(preview, Buffer.from("preview"));
  database
    .prepare(
      "INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      owner,
      "credential",
      owner,
      "Fixture password hash",
      Date.now(),
      Date.now(),
    );
  database
    .prepare(
      "INSERT INTO two_factor(id,user_id,secret,backup_codes,verified) VALUES(?,?,?,?,1)",
    )
    .run(randomUUID(), owner, "Fixture sealed TOTP", "Fixture sealed codes");
  database
    .prepare("INSERT INTO publications VALUES(?,?,?,?,?,?,?)")
    .run(
      "fixture-shared-token",
      note,
      "Published fixture",
      '{"schemaVersion":1,"blocks":[{"type":"paragraph","content":[]}]}',
      "Public snapshot",
      1,
      Date.now(),
    );
  const boardId = randomUUID();
  database
    .prepare(
      "INSERT INTO task_boards(id,owner_id,name,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .run(boardId, owner, "Archived project", 123, 1, 1);
  const boardTask = randomUUID();
  database
    .prepare(
      "INSERT INTO tasks(id,owner_id,title,board_id,open_stage,board_position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      boardTask,
      owner,
      "Board recovery",
      boardId,
      "in_progress",
      -1024,
      1,
      1,
    );
  const originalSecret = authSecret();
  const passkeyId = randomUUID();
  database
    .prepare(
      "INSERT INTO passkey(id,name,public_key,user_id,credential_id,counter,device_type,backed_up,created_at) VALUES(?,?,?,?,?,0,'singleDevice',0,?)",
    )
    .run(
      passkeyId,
      "Recovery key",
      "Fixture public key",
      owner,
      "fixture-credential",
      Date.now(),
    );
  let first: Awaited<ReturnType<typeof backups.createBackup>>;
  try {
    await t.test(
      "snapshot remains consistent while referenced files are deleted and notes change",
      async () => {
        const originalRead = storage.read;
        let changed = false;
        storage.read = async (key) => {
          if (!changed) {
            changed = true;
            database
              .prepare(
                "UPDATE notes SET title='Changed after snapshot' WHERE id=?",
              )
              .run(note);
            database.prepare("DELETE FROM attachments WHERE id=?").run(file);
            await storage.delete(file);
          }
          return originalRead(key);
        };
        try {
          first = await backups.startBackup();
        } finally {
          storage.read = originalRead;
        }
        assert.equal(first.files, 2);
        const state = await backups.backupStatus();
        assert.equal(state.running, false);
        assert.equal(state.backups.length, 1);
        assert.ok(state.lastSuccess);
        const storedManifest = await readFile(
          path.join(directory, "backups", first.id, "manifest"),
        );
        assert.equal(
          storedManifest.includes(Buffer.from("Backup sentinel")),
          false,
        );
        await assert.rejects(storage.read(file));
      },
    );
    await t.test(
      "restore verifies all objects and preserves original encryption, account secret and FTS",
      async () => {
        const target = path.join(directory, "restored");
        await backups.restoreBackup(first.id, target);
        const dbBytes = await readFile(path.join(target, "nivra.sqlite"));
        assert.equal(dbBytes.includes(Buffer.from("Backup sentinel")), false);
        assert.notEqual(
          dbBytes.subarray(0, 16).toString(),
          "SQLite format 3\0",
        );
        const key = masterKey(directory, true);
        const restored = new Database(path.join(target, "nivra.sqlite"));
        restored.pragma("cipher='chacha20'");
        restored.pragma(`key='${deriveKey(key, "sqlite").toString("hex")}'`);
        try {
          assert.equal(
            (
              restored
                .prepare("SELECT credential_id FROM passkey WHERE id=?")
                .get(passkeyId) as { credential_id: string }
            ).credential_id,
            "fixture-credential",
          );

          assert.equal(
            (
              restored.prepare("SELECT password FROM account").get() as {
                password: string;
              }
            ).password,
            "Fixture password hash",
          );
          assert.equal(
            (
              restored.prepare("SELECT secret FROM two_factor").get() as {
                secret: string;
              }
            ).secret,
            "Fixture sealed TOTP",
          );
          assert.equal(
            (
              restored.prepare("SELECT title FROM publications").get() as {
                title: string;
              }
            ).title,
            "Published fixture",
          );
          assert.equal(
            (
              restored
                .prepare("SELECT title FROM notes WHERE id=?")
                .get(note) as { title: string }
            ).title,
            "Backup sentinel",
          );
          assert.equal(
            (
              restored
                .prepare(
                  "SELECT count(*) n FROM tasks WHERE completed_at IS NOT NULL",
                )
                .get() as { n: number }
            ).n,
            1,
          );
          assert.equal(
            (
              restored
                .prepare(
                  "SELECT count(*) n FROM bookmarks_fts WHERE bookmarks_fts MATCH 'sentinel'",
                )
                .get() as { n: number }
            ).n,
            1,
          );
        } finally {
          assert.equal(
            (
              restored
                .prepare(
                  "SELECT board_id,open_stage,board_position FROM tasks WHERE id=?",
                )
                .get(boardTask) as {
                board_id: string;
                open_stage: string;
                board_position: number;
              }
            ).board_id,
            boardId,
          );
          assert.equal(
            (
              restored
                .prepare("SELECT board_position FROM tasks WHERE id=?")
                .get(boardTask) as { board_position: number }
            ).board_position,
            -1024,
          );
          assert.equal(
            (
              restored
                .prepare("SELECT open_stage FROM tasks WHERE id=?")
                .get(boardTask) as { open_stage: string }
            ).open_stage,
            "in_progress",
          );
          assert.equal(
            (
              restored
                .prepare("SELECT archived_at FROM task_boards WHERE id=?")
                .get(boardId) as { archived_at: number }
            ).archived_at,
            123,
          );
          restored.close();
        }
        const local = createStorage({ NIVRA_DATA_DIR: target });
        assert.equal((await local.read(file)).toString(), "payload");
        assert.equal((await local.read(preview)).toString(), "preview");
        assert.equal(
          unseal(
            await readFile(path.join(target, "auth.secret")),
            key,
            "auth-secret",
          ).toString(),
          originalSecret,
        );
        await assert.rejects(
          backups.restoreBackup(first.id, target),
          /empty directory/,
        );
        await backups.verifyBackup(first.id);
        const moved = path.join(directory, "relocated");
        await rename(target, moved);
        const storageModule = path.resolve("src/lib/server/storage.ts");
        const configuration = path.resolve(
          "src/lib/server/system-configuration.ts",
        );
        const script = `(async()=>{const s=await import(${JSON.stringify(storageModule)});const c=await import(${JSON.stringify(configuration)});if((await s.storage.read(${JSON.stringify(file)})).toString()!=="payload")throw new Error("Moved files unavailable");if(c.profileSource(c.systemConfiguration().local_profile).NIVRA_DATA_DIR!==process.env.NIVRA_DATA_DIR)throw new Error("Local destination retained an old host path");console.log("Relocated restore is readable");})().catch(()=>{process.exitCode=1;});`;
        const child = await promisify(execFile)(
          process.execPath,
          ["--import", "tsx", "--eval", script],
          { env: { ...process.env, NIVRA_DATA_DIR: moved }, timeout: 60000 },
        );
        assert.equal(child.stdout.trim(), "Relocated restore is readable");
      },
    );
    await t.test(
      "wrong keys, tampering, missing objects and traversal cannot publish a partial restore",
      async () => {
        const target = path.join(directory, "rejected");
        await assert.rejects(
          backups.restoreBackup(first.id, target, {
            ...process.env,
            NIVRA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
          }),
        );
        const object = path.join(directory, "backups", first.id, "files", file);
        const original = await readFile(object);
        const altered = Buffer.from(original);
        altered[altered.length - 1] ^= 1;
        await writeFile(object, altered);
        await assert.rejects(backups.restoreBackup(first.id, target));
        await writeFile(object, original);
        await rm(object);
        await assert.rejects(backups.restoreBackup(first.id, target));
        await writeFile(object, original);
        await assert.rejects(backups.restoreBackup("../escape", target));
        assert.equal((await readdir(directory)).includes("rejected"), false);
      },
    );
    await t.test(
      "retention keeps complete backups and incomplete sets never appear",
      async () => {
        await backups.createBackup();
        await backups.createBackup();
        assert.equal((await backups.listBackups()).length, 2);
        assert.equal(
          (await backups.listBackups()).some((b) => b.id === first.id),
          false,
        );
      },
    );
    await t.test(
      "scheduler runs a due backup and rejects overlapping manual starts",
      async (t) => {
        const past = Date.now() - 25 * 3600000;
        await writeFile(
          path.join(directory, "backup-state.enc"),
          seal(
            Buffer.from(
              JSON.stringify({
                lastSuccess: past,
                lastAttempt: past,
                error: null,
              }),
            ),
            masterKey(directory, true),
            "backup-state",
          ),
        );
        t.mock.timers.enable({ apis: ["setInterval"] });
        backups.startBackupScheduler();
        t.mock.timers.tick(60000);
        assert.throws(() => backups.startBackup(), /already running/);
        const runtime = globalThis as unknown as {
          nivraBackupJob?: Promise<unknown>;
          nivraBackupTimer?: ReturnType<typeof setInterval>;
        };
        await runtime.nivraBackupJob;
        assert.ok((await backups.backupStatus()).lastSuccess! > past);
        clearInterval(runtime.nivraBackupTimer);
        delete runtime.nivraBackupTimer;
        t.mock.timers.reset();
      },
    );
    await t.test(
      "failed runs release the lock and retain earlier recovery copies",
      async () => {
        const originalRead = storage.read;
        storage.read = async () => {
          throw new Error("fixture unavailable");
        };
        try {
          await assert.rejects(backups.startBackup());
        } finally {
          storage.read = originalRead;
        }
        assert.equal((await backups.backupStatus()).running, false);
        assert.equal((await backups.listBackups()).length, 2);
        assert.ok((await backups.backupStatus()).error);
        await backups.startBackup();
        assert.equal((await backups.backupStatus()).error, null);
      },
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
