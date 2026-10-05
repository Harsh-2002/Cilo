import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

test("artifacts survive full-instance recovery and unfinished OCR resumes after a restart", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "cilo-artifact-recovery-"),
  );
  process.env.CILO_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { masterKey, deriveKey } = await import("../src/lib/server/encryption");
  const { createStorage } = await import("../src/lib/server/storage");
  const { authSecret } = await import("../src/lib/server/auth");
  const backups = await import("../src/lib/server/backups");
  const { createFileArtifact, createTextArtifact } =
    await import("../src/lib/server/artifacts");
  const { ocrIdle, resumeOcr, shutdownOcr } =
    await import("../src/lib/server/ocr");
  const database = sqlite();
  const owner = randomUUID();
  database
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,username,created_at,updated_at) VALUES(?,?,?,0,?,?,?)",
    )
    .run(
      owner,
      "Recovery Owner",
      "recovery@local.invalid",
      "recovery",
      Date.now(),
      Date.now(),
    );
  try {
    authSecret();
    const sample = new Uint8Array(
      await readFile("tests/fixtures/ocr-sample.png"),
    );
    const text = createTextArtifact(
      owner,
      "Warranty card for the espresso machine",
    );
    const image = await createFileArtifact(
      owner,
      { name: "scan.png", mime: "image/png", bytes: sample },
      sample,
    );
    await ocrIdle();
    // Simulate a restart that interrupted a reading.
    const pending = await createFileArtifact(owner, {
      name: "later.png",
      mime: "image/png",
      bytes: sample,
    });
    await ocrIdle();
    database
      .prepare(
        "UPDATE artifacts SET extraction='pending',content='' WHERE id=?",
      )
      .run(pending.id);
    resumeOcr();
    await ocrIdle();
    const resumed = database
      .prepare("SELECT extraction,content FROM artifacts WHERE id=?")
      .get(pending.id) as {
      extraction: string;
      content: string;
    };
    assert.equal(resumed.extraction, "done");
    assert.match(resumed.content, /Northwind/);

    const keys = backups.referencedFiles(database);
    const rows = database
      .prepare("SELECT storage_key,thumb_key FROM artifacts WHERE id=?")
      .get(image.id) as {
      storage_key: string;
      thumb_key: string;
    };
    assert.ok(keys.includes(rows.storage_key) && keys.includes(rows.thumb_key));

    const backup = await backups.startBackup();
    await backups.verifyBackup(backup.id);
    const destination = path.join(directory, "restored");
    await backups.restoreBackup(backup.id, destination);
    const restored = await createStorage({ CILO_DATA_DIR: destination }).read(
      rows.storage_key,
    );
    assert.deepEqual(new Uint8Array(restored), sample);
    const recovered = new Database(path.join(destination, "cilo.sqlite"));
    recovered.pragma("cipher='chacha20'");
    recovered.pragma(
      `key='${deriveKey(masterKey(destination, true), "sqlite").toString("hex")}'`,
    );
    const found = (word: string) =>
      (
        recovered
          .prepare(
            "SELECT count(*) AS n FROM artifacts_fts WHERE artifacts_fts MATCH ?",
          )
          .get(word) as { n: number }
      ).n;
    assert.equal(found("espresso"), 1);
    assert.ok(found("northwind") >= 2);
    assert.equal(
      (
        recovered
          .prepare("SELECT count(*) AS n FROM artifacts WHERE id=?")
          .get(text.id) as { n: number }
      ).n,
      1,
    );
    recovered.close();

    database.exec(
      "DROP TABLE artifacts; DROP TABLE artifacts_fts; DROP TABLE artifacts_fts_vocab;",
    );
    const legacyBackup = await backups.startBackup();
    await backups.verifyBackup(legacyBackup.id);
    const legacyDestination = path.join(directory, "restored-before-artifacts");
    await backups.restoreBackup(legacyBackup.id, legacyDestination);
    const legacy = new Database(path.join(legacyDestination, "cilo.sqlite"));
    legacy.pragma("cipher='chacha20'");
    legacy.pragma(
      `key='${deriveKey(masterKey(legacyDestination, true), "sqlite").toString("hex")}'`,
    );
    assert.equal(
      (legacy.prepare("SELECT count(*) AS n FROM user").get() as { n: number })
        .n,
      1,
    );
    assert.equal(
      legacy
        .prepare("SELECT 1 FROM sqlite_master WHERE name='artifacts'")
        .get(),
      undefined,
    );
    legacy.close();
  } finally {
    await shutdownOcr();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
