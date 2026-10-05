import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
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
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-s3-"));
  const objects = new Map<string, Buffer>();
  const requested: string[] = [];
  const server = createServer(async (req, res) => {
    assert.match(
      req.headers.authorization || "",
      /^AWS4-HMAC-SHA256 Credential=test-access\//,
    );
    const url = new URL(req.url!, "http://localhost");
    assert.ok(url.pathname.startsWith("/notes/nivra/"));
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
      const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || "");
      if (value && range) {
        requested.push(`${range[1]}-${range[2]}`);
        const end = Math.min(Number(range[2]), value.length - 1);
        res.writeHead(206, {
          "content-type": "application/octet-stream",
          "content-range": `bytes ${range[1]}-${end}/${value.length}`,
        });
        res.end(value.subarray(Number(range[1]), end + 1));
        return;
      }
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
    NIVRA_DATA_DIR: directory,
    NIVRA_STORAGE_BACKEND: "s3",
    NIVRA_S3_ENDPOINT: `http://127.0.0.1:${port}`,
    NIVRA_S3_BUCKET: "notes",
    NIVRA_S3_ACCESS_KEY_ID: "test-access",
    NIVRA_S3_SECRET_ACCESS_KEY: "test-secret",
  });
  try {
    const key = randomUUID();
    const bytes = Buffer.from([0, 255, 89, 1, 2, 3]);
    await store.write(key, bytes);
    assert.notDeepEqual(objects.get(`/notes/nivra/${key}`), bytes);
    assert.equal(
      objects.get(`/notes/nivra/${key}`)?.subarray(0, 8).toString(),
      Buffer.from([67, 73, 76, 79, 69, 78, 67, 50]).toString(),
    );
    assert.deepEqual(await store.read(key), bytes);
    const encrypted = objects.get(`/notes/nivra/${key}`)!;
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    objects.set(`/notes/nivra/${key}`, tampered);
    await assert.rejects(store.read(key), /authentication/);
    objects.set(`/notes/nivra/${key}`, encrypted);
    await assert.rejects(store.write(key, bytes));
    const media = randomUUID();
    const long = Buffer.from(randomBytes(65536 * 5 + 1234));
    await store.write(media, long);
    requested.length = 0;
    const file = await store.open(media);
    assert.equal(file.size, long.length);
    assert.deepEqual(
      await file.read(65536 * 3 + 10, 65536 * 3 + 99),
      long.subarray(65536 * 3 + 10, 65536 * 3 + 100),
    );
    assert.deepEqual(requested, [
      "0-27",
      `${28 + 3 * 65552}-${28 + 4 * 65552 - 1}`,
    ]);
    assert.deepEqual(
      await file.read(65536 * 5, long.length + 500),
      long.subarray(65536 * 5),
    );
    assert.deepEqual(await store.read(media), long);
    await store.delete(key);
    await store.delete(key);
    await assert.rejects(store.read(key));
    await assert.rejects(store.read("../private"));
    assert.throws(
      () => createStorage({ NIVRA_STORAGE_BACKEND: "s3" }),
      /requires/,
    );
    assert.throws(
      () => createStorage({ NIVRA_STORAGE_BACKEND: "unsupported" }),
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
  const original = process.env.NIVRA_UPLOAD_LIMIT_MIB;
  try {
    process.env.NIVRA_UPLOAD_LIMIT_MIB = "1.5";
    assert.throws(uploadLimit, /integer/);
  } finally {
    if (original === undefined) delete process.env.NIVRA_UPLOAD_LIMIT_MIB;
    else process.env.NIVRA_UPLOAD_LIMIT_MIB = original;
  }
});
