import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importPath } from "../src/lib/import-files";
import { createStorage } from "../src/lib/server/storage";
import { uploadLimit } from "../src/lib/server/config";
test("import paths resolve folder assets without treating remote URLs as local", () => {
  assert.equal(
    importPath("../images/a%20b.png", "notes/sub"),
    "notes/images/a b.png",
  );
  assert.equal(importPath("https://example.com/image.png", "notes"), null);
  assert.equal(importPath("../../secret.png", "notes"), null);
  assert.equal(importPath("/images/pic.png", "notes"), "images/pic.png");
});
test("S3 adapter signs path-style requests, preserves binary files, and deletes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cilo-s3-"));
  const objects = new Map<string, Buffer>();
  const server = createServer(async (req, res) => {
    assert.match(
      req.headers.authorization || "",
      /^AWS4-HMAC-SHA256 Credential=test-access\//,
    );
    const url = new URL(req.url!, "http://localhost");
    assert.ok(url.pathname.startsWith("/notes/cilo/"));
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
      res.writeHead(value ? 200 : 404, {
        "content-type": "application/octet-stream",
      });
      res.end(value);
    } else {
      objects.delete(url.pathname);
      res.writeHead(204);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const store = createStorage({
    CILO_DATA_DIR: directory,
    CILO_STORAGE_BACKEND: "s3",
    CILO_S3_ENDPOINT: `http://127.0.0.1:${port}`,
    CILO_S3_BUCKET: "notes",
    CILO_S3_ACCESS_KEY_ID: "test-access",
    CILO_S3_SECRET_ACCESS_KEY: "test-secret",
  });
  try {
    const key = randomUUID();
    const bytes = Buffer.from([0, 255, 89, 1, 2, 3]);
    await store.write(key, bytes);
    assert.notDeepEqual(objects.get(`/notes/cilo/${key}`), bytes);
    assert.equal(
      objects.get(`/notes/cilo/${key}`)?.subarray(0, 8).toString(),
      "CILOENC1",
    );
    assert.deepEqual(await store.read(key), bytes);
    const encrypted = objects.get(`/notes/cilo/${key}`)!;
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    objects.set(`/notes/cilo/${key}`, tampered);
    await assert.rejects(store.read(key), /authentication/);
    objects.set(`/notes/cilo/${key}`, encrypted);
    await assert.rejects(store.write(key, bytes));
    await store.delete(key);
    await store.delete(key);
    await assert.rejects(store.read(key));
    await assert.rejects(store.read("../private"));
    assert.throws(
      () => createStorage({ CILO_STORAGE_BACKEND: "s3" }),
      /requires/,
    );
    assert.throws(
      () => createStorage({ CILO_STORAGE_BACKEND: "unsupported" }),
      /must be/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("invalid upload environment configuration fails instead of silently changing limits", () => {
  const original = process.env.CILO_UPLOAD_LIMIT_MIB;
  try {
    process.env.CILO_UPLOAD_LIMIT_MIB = "1.5";
    assert.throws(uploadLimit, /integer/);
  } finally {
    if (original === undefined) delete process.env.CILO_UPLOAD_LIMIT_MIB;
    else process.env.CILO_UPLOAD_LIMIT_MIB = original;
  }
});
