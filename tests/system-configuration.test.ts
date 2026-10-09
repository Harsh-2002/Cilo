import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

test("onboarding initializes only on submission and System protects configuration, encryption and active files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-system-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { handleWorkspace } = await import("../src/lib/server/workspace-api");
  const { sqlite } = await import("../src/lib/server/db");
  const { storage, copyStorageObject } =
    await import("../src/lib/server/storage");
  const { systemConfiguration, writeProfile, readProfile } =
    await import("../src/lib/server/system-configuration");
  const { activateStorage, storageOperation } =
    await import("../src/lib/server/storage-operations");
  let cookie = "";
  const call = (
    route: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) =>
    handleWorkspace(
      new Request(`http://localhost:3000/api/nivra/${route}`, {
        method,
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          ...(authenticated ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { params: Promise.resolve({ path: route.split("/") }) },
    );
  try {
    assert.equal((await call("health")).status, 200);
    const discovery =
      await import("../src/app/.well-known/oauth-authorization-server/api/auth/route");
    assert.equal(
      (
        await discovery.GET(
          new Request(
            "http://localhost:3000/.well-known/oauth-authorization-server/api/auth",
          ),
        )
      ).status,
      409,
    );
    assert.equal(
      (await (await call("status")).json()).installation.locked,
      false,
    );
    assert.equal(existsSync(path.join(directory, "nivra.sqlite")), false);
    assert.equal(
      (
        await call("setup", "POST", {
          name: "Test",
          username: "tester",
          password: "too-short",
          encrypted: false,
        })
      ).status,
      400,
    );
    assert.equal(
      existsSync(path.join(directory, "encryption-mode.json")),
      false,
    );
    const setup = await call("setup", "POST", {
      name: "Test",
      username: "tester",
      password: "long-test-password",
      encrypted: false,
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const status = await (await call("system")).json();
    assert.equal(status.encrypted, false);
    assert.equal(status.uploadMiB, 25);
    assert.equal((await call("system", "GET", undefined, false)).status, 401);
    assert.equal(
      (
        await call("system", "PATCH", {
          revision: status.revision,
          storageBackend: "local",
          s3Backups: false,
          uploadMiB: 7,
          backupHours: 12,
          backupKeep: 3,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("system", "PATCH", {
          revision: status.revision,
          storageBackend: "local",
          s3Backups: false,
          uploadMiB: 7,
          backupHours: 12,
          backupKeep: 3,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("setup", "POST", {
          name: "Other",
          username: "other",
          password: "long-test-password",
          encrypted: true,
        })
      ).status,
      409,
    );
    const mode = JSON.parse(
      await readFile(path.join(directory, "encryption-mode.json"), "utf8"),
    );
    assert.equal(mode.encrypted, false);
    const initial = systemConfiguration();
    const destination = writeProfile({
      backend: "local",
      directory: path.join(directory, "destination"),
    });
    const key = randomUUID();
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let begun!: () => void;
    const started = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const uploading = storageOperation(async () => {
      begun();
      await waiting;
      await storage.write(key, Buffer.from("existing file"));
    });
    await started;
    let activated = false;
    const switcher = activateStorage(() => {
      sqlite()
        .prepare("UPDATE system_configuration SET media_profile=? WHERE id=1")
        .run(destination);
      activated = true;
    });
    await Promise.resolve();
    assert.equal(activated, false);
    finish();
    await uploading;
    await switcher;
    assert.equal((await storage.read(key)).toString(), "existing file");
    assert.equal(
      (
        sqlite()
          .prepare(
            "SELECT profile_id FROM storage_locations WHERE storage_key=?",
          )
          .get(key) as { profile_id: string }
      ).profile_id,
      initial.media_profile,
    );
    assert.equal(await copyStorageObject(key, destination), true);
    assert.equal((await storage.read(key)).toString(), "existing file");
    assert.ok(existsSync(path.join(directory, "uploads", key)));
    await storage.delete(key);
    assert.equal(
      await copyStorageObject(key, destination).catch(() => false),
      false,
    );
    assert.ok(readProfile(initial.media_profile));
  } finally {
    const { stopJobWorker } = await import("../src/lib/server/jobs");
    await stopJobWorker();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
