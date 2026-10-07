import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("reused authentication contexts preserve origin checks and immediate session revocation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-auth-runtime-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { auth } = await import("../src/lib/server/auth");
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const authRoutes = await import("../src/app/api/auth/[...all]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { stopJobWorker } = await import("../src/lib/server/jobs");
  const origin = "http://localhost:3000";
  const make = (endpoint: string, cookie = "", requestOrigin = origin) =>
    new Request(origin + endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: requestOrigin,
        cookie,
      },
      body: "{}",
    });
  try {
    const setup = await routes.POST(
      new Request(origin + "/api/nivra/setup", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          name: "Runtime owner",
          username: "runtimeowner",
          password: "Fixture-runtime-password-123",
        }),
      }),
      { params: Promise.resolve({ path: ["setup"] }) },
    );
    assert.equal(setup.status, 200);
    const cookie = setup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const req = make("/api/auth/sign-out", cookie);
    const instance = auth(req);
    assert.equal(auth(req), instance);
    assert.ok(await instance.api.getSession({ headers: req.headers }));
    assert.equal(
      (
        await authRoutes.POST(
          make("/api/auth/sign-out", cookie, "https://untrusted.example"),
        )
      ).status,
      403,
    );
    assert.ok(await instance.api.getSession({ headers: req.headers }));
    assert.equal((await authRoutes.POST(req)).status, 200);
    assert.equal(await instance.api.getSession({ headers: req.headers }), null);
    assert.equal(
      await auth(req).api.getSession({ headers: req.headers }),
      null,
    );
    let limited = false;
    for (let attempt = 0; attempt < 35; attempt++) {
      const response = await authRoutes.POST(
        new Request(origin + "/api/auth/sign-in/username", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            username: "runtimeowner",
            password: "Incorrect-fixture-password-123",
          }),
        }),
      );
      if (response.status === 429) {
        limited = true;
        break;
      }
      assert.equal(response.status, 401);
    }
    assert.equal(
      limited,
      true,
      "repeated auth requests retain rate-limit state",
    );
  } finally {
    await stopJobWorker();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
