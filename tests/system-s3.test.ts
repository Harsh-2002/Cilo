import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

test("System verifies a shared S3 bucket, encrypts credentials, fences verification and retains recoverable file locations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-system-s3-"));
  process.env.NIVRA_DATA_DIR = directory;
  const objects = new Map<string, Buffer>();
  const prefixes: string[] = [];
  let denied = false;
  let retired = false;
  const server = createServer(async (req, res) => {
    if (
      denied ||
      (retired &&
        req.headers.authorization?.includes("Credential=fixture-access/"))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    assert.match(
      req.headers.authorization || "",
      /^AWS4-HMAC-SHA256 Credential=fixture-/,
    );
    const url = new URL(req.url!, "http://localhost");
    if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
      prefixes.push(url.searchParams.get("prefix") || "");
      const prefix =
        url.pathname.replace(/\/$/, "") +
        "/" +
        (url.searchParams.get("prefix") || "");
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
      res.setHeader("Content-Type", "application/xml");
      res.end(
        `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${k.slice(url.pathname.replace(/\/$/, "").length + 1)}</Key><Size>${objects.get(k)!.length}</Size></Contents>`).join("")}</ListBucketResult>`,
      );
      return;
    }
    if (req.method === "PUT") {
      if (objects.has(url.pathname) && req.headers["if-none-match"] === "*") {
        res.writeHead(412);
        res.end();
        return;
      }
      const parts: Buffer[] = [];
      for await (const chunk of req) parts.push(Buffer.from(chunk));
      objects.set(url.pathname, Buffer.concat(parts));
      res.end();
    } else if (req.method === "GET") {
      const bytes = objects.get(url.pathname);
      if (!bytes) {
        res.writeHead(404);
        res.end();
        return;
      }
      const range = String(req.headers.range || "").match(
        /^bytes=(\d+)-(\d+)$/,
      );
      if (range) {
        const start = Number(range[1]),
          end = Math.min(Number(range[2]), bytes.length - 1);
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        });
        res.end(bytes.subarray(start, end + 1));
      } else res.end(bytes);
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
  const { handleWorkspace } = await import("../src/lib/server/workspace-api");
  const { sqlite } = await import("../src/lib/server/db");
  const { storage } = await import("../src/lib/server/storage");
  const { transferTick } = await import("../src/lib/server/system-api");
  let cookie = "";
  const call = (
    route: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) =>
    handleWorkspace(
      new Request("http://localhost:3000/api/v1/" + route, {
        method,
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          ...(authenticated ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { params: Promise.resolve({ path: route.split("/") }) },
    );
  const connection = {
    provider: "compatible",
    endpoint,
    region: "us-east-1",
    bucket: "shared",
    accessKeyId: "fixture-access",
    secretAccessKey: "fixture-secret",
    pathStyle: true,
  };
  try {
    const setup = await call("setup", "POST", {
      name: "Fixture",
      username: "systemfixture",
      password: "long-fixture-password",
      encrypted: true,
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    let status = await (await call("system")).json();
    const update = (revision: number, token?: string) => ({
      revision,
      storageBackend: "s3",
      s3Backups: true,
      uploadMiB: 25,
      backupHours: 24,
      backupKeep: 7,
      ...(token ? { verificationToken: token } : {}),
    });
    assert.equal(
      (
        await call(
          "system/verify",
          "POST",
          { connection, s3Backups: true },
          false,
        )
      ).status,
      401,
    );
    assert.equal(
      (await call("system", "PATCH", update(status.revision))).status,
      400,
    );
    denied = true;
    assert.equal(
      (await call("system/verify", "POST", { connection, s3Backups: true }))
        .status,
      400,
    );
    denied = false;
    const verify = await call("system/verify", "POST", {
      connection,
      s3Backups: true,
    });
    assert.equal(verify.status, 200);
    const { verificationToken } = await verify.json();
    assert.deepEqual(prefixes.slice(-2), ["nivra/", "nivra-backups/"]);
    assert.equal(objects.size, 0);
    assert.equal(
      (
        await call("system/verify/extra", "POST", {
          connection,
          s3Backups: true,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call("system", "PATCH", {
          ...update(status.revision, verificationToken),
          encryption: false,
        })
      ).status,
      400,
    );
    const key = randomUUID();
    await storage.write(key, Buffer.from("original content"));
    const saved = await call(
      "system",
      "PATCH",
      update(status.revision, verificationToken),
    );
    assert.equal(saved.status, 200);
    status = await saved.json();
    assert.equal(status.connection.hasCredentials, true);
    assert.ok(!JSON.stringify(status).includes("fixture-secret"));
    assert.ok(!JSON.stringify(status).includes("fixture-access"));
    assert.equal((await storage.read(key)).toString(), "original content");
    await transferTick();
    assert.equal((await storage.read(key)).toString(), "original content");
    assert.equal(
      (await readFile(path.join(directory, "uploads", key)))
        .subarray(0, 4)
        .equals(Buffer.from("orig")),
      false,
    );
    assert.equal((await call("system/cleanup", "POST", {})).status, 409);
    const encrypted = sqlite()
      .prepare("SELECT configuration FROM storage_profiles")
      .all() as { configuration: Buffer }[];
    assert.ok(
      encrypted.every(
        (r) => !r.configuration.includes(Buffer.from("fixture-secret")),
      ),
    );
    assert.equal(
      (
        await call(
          "system",
          "PATCH",
          update(status.revision, verificationToken),
        )
      ).status,
      409,
    );
    const rotated = await call("system/verify", "POST", {
      connection: { ...connection, accessKeyId: "fixture-rotated" },
      s3Backups: true,
    });
    assert.equal(rotated.status, 200);
    retired = true;
    const rotation = await call(
      "system",
      "PATCH",
      update(status.revision, (await rotated.json()).verificationToken),
    );
    assert.equal(rotation.status, 200);
    assert.equal((await storage.read(key)).toString(), "original content");
    await transferTick();
    assert.equal((await storage.read(key)).toString(), "original content");
    assert.equal(
      (
        sqlite().prepare("SELECT count(*) n FROM storage_copies").get() as {
          n: number;
        }
      ).n,
      1,
    );
    const { createBackup, verifyBackup } =
      await import("../src/lib/server/backups");
    const backup = await createBackup();
    await verifyBackup(backup.id);
    assert.equal((await call("system/cleanup", "POST", {})).status, 200);
    assert.equal((await storage.read(key)).toString(), "original content");
    await assert.rejects(readFile(path.join(directory, "uploads", key)));
    await storage.delete(key);
    await storage.delete(key);
    assert.ok(!objects.has("/shared/nivra/" + key));
    assert.ok(
      [...objects.keys()].some((k) => k.startsWith("/shared/nivra-backups/")),
    );
    await assert.rejects(storage.read(key));
  } finally {
    const { stopJobWorker } = await import("../src/lib/server/jobs");
    await stopJobWorker();
    sqlite().close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
