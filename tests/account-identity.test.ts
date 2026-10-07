import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isLoginIdentifier } from "../src/lib/login-identifier";

test("login identifiers accept usernames and email addresses and reject invalid input", () => {
  for (const value of [
    "owner_123",
    "Owner.Name",
    "owner@example.com",
    "first.last+notes@example.com",
  ])
    assert.equal(isLoginIdentifier(value), true);
  for (const value of [
    "ab",
    "has spaces",
    "bad@",
    "@example.com",
    "name/other",
    "a".repeat(31),
    "a".repeat(255) + "@example.com",
  ])
    assert.equal(isLoginIdentifier(value), false);
});
test("email-shaped owner identifiers sign in and identity changes are blocked by both API and SQLite", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-identity-"));
  process.env.NIVRA_DATA_DIR = directory;
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const authRoutes = await import("../src/app/api/auth/[...all]/route");
  const { sqlite } = await import("../src/lib/server/db");
  let cookie = "";
  const password = "Fixture-identity-password-123";
  const request = (url: string, body: unknown) =>
    new Request("http://localhost:3000" + url, {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify(body),
    });
  const retain = (r: Response) => {
    for (const c of r.headers.getSetCookie()) {
      if (c.startsWith("better-auth.session_token=")) cookie = c.split(";")[0];
    }
    return r;
  };
  try {
    const created = retain(
      await routes.POST(
        request("/api/nivra/setup", {
          name: "Email Owner",
          username: "First.Last+Notes@Example.com",
          password,
        }),
        { params: Promise.resolve({ path: ["setup"] }) },
      ),
    );
    assert.equal(created.status, 200);
    const owner = sqlite().prepare("SELECT name,username FROM user").get() as {
      name: string;
      username: string;
    };
    assert.equal(owner.username, "first.last+notes@example.com");
    for (const body of [
      { name: "Changed" },
      { username: "changed" },
      { displayUsername: "Changed" },
    ])
      assert.equal(
        (await authRoutes.POST(request("/api/auth/update-user", body))).status,
        403,
      );
    assert.throws(
      () => sqlite().prepare("UPDATE user SET name='Changed'").run(),
      /identity is fixed/,
    );
    assert.throws(
      () => sqlite().prepare("UPDATE user SET username='changed'").run(),
      /identity is fixed/,
    );
    assert.deepEqual(
      sqlite().prepare("SELECT name,username FROM user").get(),
      owner,
    );
    await authRoutes.POST(request("/api/auth/sign-out", {}));
    cookie = "";
    const login = retain(
      await authRoutes.POST(
        request("/api/auth/sign-in/username", {
          username: "FIRST.LAST+NOTES@EXAMPLE.COM",
          password,
        }),
      ),
    );
    assert.equal(login.status, 200);
    assert.ok(cookie);
    assert.equal(
      (
        await authRoutes.GET(
          new Request("http://localhost:3000/api/auth/get-session", {
            headers: { cookie },
          }),
        )
      ).status,
      200,
    );
  } finally {
    await (await import("../src/lib/server/jobs")).stopJobWorker();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
