import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

test("a fresh plaintext installation supports owner setup, authorized files and durable extraction", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nivra-plain-startup-"),
  );
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_ENCRYPTION_ENABLED = "false";
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { auth } = await import("../src/lib/server/auth");
  const { jobsIdle, stopJobWorker } = await import("../src/lib/server/jobs");
  let cookie = "";
  const call = (
    route: string,
    method = "GET",
    body?: BodyInit,
    authenticated = true,
  ) =>
    routes.GET(
      new Request(`http://localhost:3000/api/nivra/${route}`, {
        method,
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          ...(typeof body === "string"
            ? { "content-type": "application/json" }
            : {}),
          ...(authenticated ? { cookie } : {}),
        },
        body,
      }),
      { params: Promise.resolve({ path: route.split("/") }) },
    );
  try {
    assert.equal((await call("notes", "GET", undefined, false)).status, 401);
    const password = `Fixture-${randomUUID()}`;
    const setup = await call(
      "setup",
      "POST",
      JSON.stringify({
        name: "Plain fixture",
        username: "plainfixture",
        password,
      }),
      false,
    );
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert.equal((await call("notes")).status, 200);
    assert.equal(
      (
        await call(
          "setup",
          "POST",
          JSON.stringify({ name: "Other", username: "otherfixture", password }),
          false,
        )
      ).status,
      409,
    );
    const signIn = await auth().api.signInUsername({
      body: { username: "plainfixture", password },
    });
    assert.ok(signIn.user.id);
    const payload =
      "Unencrypted startup processing fixture\nsearchableplaintexttoken";
    const form = new FormData();
    form.set(
      "file",
      new File([payload], "fixture.txt", { type: "text/plain" }),
    );
    const uploaded = await call("artifacts", "POST", form);
    assert.equal(uploaded.status, 201);
    const { id } = (await uploaded.json()) as { id: string };
    await jobsIdle();
    const detail = (await (await call(`artifacts/${id}`)).json()) as {
      extraction: string;
      content: string;
    };
    assert.equal(detail.extraction, "done");
    assert.equal(detail.content, payload);
    assert.equal(
      (await call(`artifacts/${id}/file`, "GET", undefined, false)).status,
      401,
    );
    const download = await call(`artifacts/${id}/file`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), payload);
    assert.match(download.headers.get("cache-control") || "", /no-store/);
    const { storage_key } = sqlite()
      .prepare("SELECT storage_key FROM artifacts WHERE id=?")
      .get(id) as { storage_key: string };
    assert.equal(
      (await readFile(path.join(directory, "uploads", storage_key))).toString(),
      payload,
    );
    const event = sqlite()
      .prepare("SELECT status FROM completion_events WHERE target_id=?")
      .get(id) as { status: string };
    assert.equal(event.status, "done");
    assert.equal(
      (sqlite().prepare("SELECT count(*) n FROM user").get() as { n: number })
        .n,
      1,
    );
    sqlite().pragma("wal_checkpoint(TRUNCATE)");
    assert.equal(
      (await readFile(path.join(directory, "nivra.sqlite")))
        .subarray(0, 16)
        .toString(),
      "SQLite format 3\0",
    );
  } finally {
    await stopJobWorker();
    sqlite().close();
    delete process.env.NIVRA_ENCRYPTION_ENABLED;
    await rm(directory, { recursive: true, force: true });
  }
});
