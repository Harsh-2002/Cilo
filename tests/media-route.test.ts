import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("private media streams from chunked storage with ranges and rejects damaged chunks", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-media-route-"));
  process.env.NIVRA_DATA_DIR = directory;
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  let cookie = "";
  const call = (
    route: string,
    options: {
      method?: string;
      body?: BodyInit;
      headers?: Record<string, string>;
      authenticated?: boolean;
    } = {},
  ) =>
    routes.GET(
      new Request(`http://localhost:3000/api/nivra/${route}`, {
        method: options.method || "GET",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          ...(options.body instanceof FormData
            ? {}
            : { "content-type": "application/json" }),
          ...(options.authenticated === false ? {} : { cookie }),
          ...options.headers,
        },
        body: options.body,
      }),
      { params: Promise.resolve({ path: route.split("?")[0].split("/") }) },
    );
  try {
    const setup = await call("setup", {
      method: "POST",
      authenticated: false,
      body: JSON.stringify({
        name: "Media Owner",
        username: "media",
        password: `Test-${randomUUID()}`,
      }),
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const note = await (
      await call("notes", {
        method: "POST",
        body: JSON.stringify({ title: "Recording" }),
      })
    ).json();
    const video = randomBytes(3 * 1024 * 1024 + 777);
    video.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70], 0);
    const form = new FormData();
    form.set("note", note.id);
    form.set("file", new File([video], "clip.mp4", { type: "video/mp4" }));
    const upload = await call("files", { method: "POST", body: form });
    assert.equal(upload.status, 201);
    const file = (await upload.json()) as { id: string; url: string };
    const route = file.url.replace("/api/nivra/", "");
    const stored = path.join(directory, "uploads", file.id);
    assert.equal(
      (await readFile(stored)).subarray(0, 8).toString(),
      Buffer.from([67, 73, 76, 79, 69, 78, 67, 50]).toString(),
    );

    assert.equal((await call(route, { authenticated: false })).status, 401);
    const ranged = await call(route, {
      headers: { Range: "bytes=70000-70099" },
    });
    assert.equal(ranged.status, 206);
    assert.deepEqual(
      Buffer.from(await ranged.arrayBuffer()),
      video.subarray(70000, 70100),
    );
    const tail = await call(route, { headers: { Range: "bytes=-1000" } });
    assert.deepEqual(
      Buffer.from(await tail.arrayBuffer()),
      video.subarray(-1000),
    );
    const big = await call(route, { headers: { Range: "bytes=100-2500000" } });
    assert.equal(big.headers.get("Content-Length"), String(2500000 - 100 + 1));
    assert.deepEqual(
      Buffer.from(await big.arrayBuffer()),
      video.subarray(100, 2500001),
    );
    const whole = await call(route);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get("Content-Length"), String(video.length));
    assert.ok(whole.body instanceof ReadableStream);
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), video);

    const original = await readFile(stored);
    const damaged = Buffer.from(original);
    damaged[28 + 20 * (65536 + 16) + 5] ^= 1;
    await writeFile(stored, damaged);
    const beforeDamage = await call(route, {
      headers: { Range: "bytes=0-999" },
    });
    assert.equal(beforeDamage.status, 206);
    const inside = await call(route, {
      headers: { Range: `bytes=${20 * 65536 + 10}-${20 * 65536 + 99}` },
    });
    assert.ok(inside.status >= 500, `damaged range returned ${inside.status}`);
    const stream = await call(route);
    await assert.rejects(stream.arrayBuffer());
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
