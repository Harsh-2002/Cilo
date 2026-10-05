import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
test("hybrid backups copy encrypted S3 files, paginate the destination, and recover locally", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "cilo-hybrid-backup-"),
  );
  const objects = new Map<string, Buffer>();
  let listed = 0;
  const server = createServer(async (req, res) => {
    assert.match(
      req.headers.authorization || "",
      /^AWS4-HMAC-SHA256 Credential=fixture-/,
    );
    const url = new URL(req.url!, "http://localhost");
    if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
      listed++;
      const prefix = `${url.pathname.replace(/\/$/, "")}/${url.searchParams.get("prefix")}`;
      const keys = [...objects.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort();
      const offset = Number(url.searchParams.get("continuation-token") || 0);
      const page = keys.slice(offset, offset + 2);
      const truncated = offset + 2 < keys.length;
      res.setHeader("Content-Type", "application/xml");
      res.end(
        `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${offset + 2}</NextContinuationToken>` : ""}${page.map((k) => `<Contents><Key>${k.slice(url.pathname.replace(/\/$/, "").length + 1)}</Key><Size>${objects.get(k)!.length}</Size></Contents>`).join("")}</ListBucketResult>`,
      );
      return;
    }
    if (req.method === "PUT") {
      assert.equal(req.headers["if-none-match"], "*");
      if (objects.has(url.pathname)) {
        res.writeHead(412);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(url.pathname, Buffer.concat(chunks));
      res.end();
    } else if (req.method === "GET") {
      const value = objects.get(url.pathname);
      res.writeHead(value ? 200 : 404);
      res.end(value);
    } else if (req.method === "DELETE") {
      objects.delete(url.pathname);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(400);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  Object.assign(process.env, {
    CILO_DATA_DIR: directory,
    CILO_STORAGE_BACKEND: "s3",
    CILO_S3_ENDPOINT: endpoint,
    CILO_S3_BUCKET: "files",
    CILO_S3_ACCESS_KEY_ID: "fixture-media",
    CILO_S3_SECRET_ACCESS_KEY: "fixture-secret",
    CILO_S3_PREFIX: "media",
    CILO_BACKUP_BACKEND: "s3",
    CILO_BACKUP_S3_ENDPOINT: endpoint,
    CILO_BACKUP_S3_BUCKET: "backups",
    CILO_BACKUP_S3_ACCESS_KEY_ID: "fixture-backup",
    CILO_BACKUP_S3_SECRET_ACCESS_KEY: "fixture-secret",
    CILO_BACKUP_S3_PREFIX: "recovery",
    CILO_BACKUP_KEEP: "1",
  });
  const { sqlite } = await import("../src/lib/server/db");
  const { storage, createStorage } = await import("../src/lib/server/storage");
  const { authSecret } = await import("../src/lib/server/auth");
  const backups = await import("../src/lib/server/backups");
  const { backupRepository } =
    await import("../src/lib/server/backup-repository");
  const db = sqlite();
  try {
    const owner = randomUUID(),
      note = randomUUID(),
      file = randomUUID();
    db.prepare(
      "INSERT INTO user(id,name,email,email_verified,username,created_at,updated_at) VALUES(?,?,?,0,?,?,?)",
    ).run(
      owner,
      "Fixture",
      "fixture@local.invalid",
      "fixture",
      Date.now(),
      Date.now(),
    );
    db.prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      note,
      owner,
      "Hybrid fixture",
      '{"schemaVersion":1,"blocks":[{"type":"paragraph","content":[]}]}',
      "Remote recovery",
      Date.now(),
      Date.now(),
    );
    db.prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)").run(
      file,
      note,
      "remote.bin",
      "application/octet-stream",
      7,
      file,
      Date.now(),
    );
    await storage.write(file, Buffer.from("payload"));
    authSecret();
    const first = await backups.startBackup();
    assert.equal(first.files, 1);
    assert.ok(listed >= 2);
    assert.equal((await backups.listBackups()).length, 1);
    for (const value of objects.values())
      assert.match(value.subarray(0, 8).toString(), /^CILOENC[12]$/);
    assert.equal((await backups.copyStoredFiles("local")).files, 1);
    assert.equal(
      (await createStorage({ CILO_DATA_DIR: directory }).read(file)).toString(),
      "payload",
    );
    objects.delete(`/files/media/${file}`);
    const target = path.join(directory, "restored");
    await backups.restoreBackup(first.id, target);
    const local = createStorage({ CILO_DATA_DIR: target });
    assert.equal((await local.read(file)).toString(), "payload");
    await storage.write(file, Buffer.from("payload"));
    await backups.startBackup();
    assert.equal((await backups.listBackups()).length, 1);
    assert.equal(
      [...objects.keys()].some((k) => k.includes(first.id)),
      false,
    );
    assert.throws(
      () =>
        backupRepository({
          ...process.env,
          CILO_BACKUP_S3_BUCKET: "files",
          CILO_BACKUP_S3_PREFIX: "media",
        }),
      /separate/,
    );
    await assert.rejects(backupRepository().read("../escape"));
  } finally {
    db.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
