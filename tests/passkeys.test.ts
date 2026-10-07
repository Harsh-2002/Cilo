import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { authenticator } from "./fixtures/passkey";

const base64 = (value: Uint8Array) => Buffer.from(value).toString("base64url");
test("passkeys verify signatures and user verification, enforce management freshness, preserve recovery and coexist with password MFA", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-passkeys-"));
  process.env.NIVRA_DATA_DIR = directory;
  const authRoute = await import("../src/app/api/auth/[...all]/route");
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { stopJobWorker } = await import("../src/lib/server/jobs");
  const cookies = new Map<string, string>();
  const request = (
    endpoint: string,
    body?: unknown,
    origin = "http://localhost:3000",
  ) =>
    new Request("http://localhost:3000" + endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const save = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const [first] = cookie.split(";");
      const pos = first.indexOf("=");
      if (first.slice(pos + 1))
        cookies.set(first.slice(0, pos), first.slice(pos + 1));
      else cookies.delete(first.slice(0, pos));
    }
    return response;
  };
  const auth = async (endpoint: string, body?: unknown, origin?: string) =>
    save(await authRoute.POST(request("/api/auth/" + endpoint, body, origin)));
  const nivra = async (endpoint: string, body?: unknown) =>
    save(
      await routes.GET(request("/api/nivra/" + endpoint, body), {
        params: Promise.resolve({ path: endpoint.split("/") }),
      }),
    );
  async function options(endpoint: string) {
    const r = await auth("passkey/generate-" + endpoint + "-options");
    assert.equal(r.status, 200);
    const value = await r.json();
    if (endpoint === "authenticate")
      assert.equal(value.userVerification, "required");
    return value;
  }
  try {
    assert.equal((await auth("passkey/list-user-passkeys")).status, 401);
    assert.equal((await auth("passkey/generate-register-options")).status, 401);
    const password = "Fixture-" + randomUUID();
    const setup = await nivra("setup", {
      name: "Passkey Owner",
      username: "passkeyowner",
      password,
    });
    assert.equal(setup.status, 200);
    const recoveryCode = (await setup.json()).recoveryCode;
    const key = authenticator();
    let opts = await options("register");
    assert.equal(opts.authenticatorSelection.residentKey, "required");
    assert.equal(opts.authenticatorSelection.userVerification, "required");
    const unverified = authenticator();
    assert.notEqual(
      (
        await auth("passkey/verify-registration", {
          response: unverified.registration(opts.challenge, false),
          name: "Rejected",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        sqlite().prepare("SELECT count(*) AS n FROM passkey").get() as {
          n: number;
        }
      ).n,
      0,
    );
    opts = await options("register");
    const registration = await auth("passkey/verify-registration", {
      response: key.registration(opts.challenge),
      name: "Security key",
    });
    assert.equal(registration.status, 200);
    opts = await options("register");
    assert.notEqual(
      (
        await auth("passkey/verify-registration", {
          response: key.registration(opts.challenge),
          name: "Duplicate",
        })
      ).status,
      200,
    );
    let list = await (await auth("passkey/list-user-passkeys")).json();
    assert.equal(list.length, 1);
    const credential = list[0].id;
    assert.equal(
      (
        await auth("passkey/update-passkey", {
          id: credential,
          name: "Backup key",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await auth("passkey/update-passkey", {
          id: credential,
          name: "x".repeat(81),
        })
      ).status,
      400,
    );
    assert.notEqual(
      (await auth("passkey/delete-passkey", { id: randomUUID() })).status,
      200,
    );
    sqlite()
      .prepare("UPDATE session SET created_at=?")
      .run(Date.now() - 301000);
    for (const [endpoint, body] of [
      ["generate-register-options", undefined],
      ["update-passkey", { id: credential, name: "Forbidden" }],
      ["delete-passkey", { id: credential }],
    ] as const)
      assert.equal((await auth("passkey/" + endpoint, body)).status, 403);
    sqlite().prepare("UPDATE session SET created_at=?").run(Date.now());
    sqlite().prepare("UPDATE user SET two_factor_enabled=1").run();
    await auth("sign-out", {});
    cookies.clear();
    const passwordLogin = await auth("sign-in/username", {
      username: "passkeyowner",
      password,
    });
    assert.equal((await passwordLogin.json()).twoFactorRedirect, true);
    cookies.clear();
    opts = await options("authenticate");
    const assertion = key.authentication(opts.challenge);
    assert.equal(
      (await auth("passkey/verify-authentication", { response: assertion }))
        .status,
      200,
    );
    assert.equal((await nivra("settings")).status, 200);
    assert.notEqual(
      (await auth("passkey/verify-authentication", { response: assertion }))
        .status,
      200,
    );
    await auth("sign-out", {});
    cookies.clear();
    opts = await options("authenticate");
    assert.notEqual(
      (
        await auth("passkey/verify-authentication", {
          response: key.authentication(opts.challenge, false),
        })
      ).status,
      200,
    );
    opts = await options("authenticate");
    assert.notEqual(
      (
        await auth("passkey/verify-authentication", {
          response: key.authentication(
            opts.challenge,
            true,
            "https://attacker.example",
          ),
        })
      ).status,
      200,
    );
    opts = await options("authenticate");
    assert.notEqual(
      (
        await auth("passkey/verify-authentication", {
          response: key.authentication(
            opts.challenge,
            true,
            "http://localhost:3000",
            "wrong.example",
          ),
        })
      ).status,
      200,
    );
    opts = await options("authenticate");
    const altered = key.authentication(opts.challenge);
    altered.response.signature = base64(randomBytes(72));
    assert.notEqual(
      (await auth("passkey/verify-authentication", { response: altered }))
        .status,
      200,
    );
    opts = await options("authenticate");
    sqlite()
      .prepare("UPDATE verification SET expires_at=?")
      .run(Date.now() - 1000);
    assert.notEqual(
      (
        await auth("passkey/verify-authentication", {
          response: key.authentication(opts.challenge),
        })
      ).status,
      200,
    );
    opts = await options("authenticate");
    assert.notEqual(
      (
        await auth(
          "passkey/verify-authentication",
          { response: key.authentication(opts.challenge) },
          "https://attacker.example",
        )
      ).status,
      200,
    );
    const recovered = await nivra("recover", {
      code: recoveryCode,
      password: "New-" + password,
    });
    assert.equal(recovered.status, 200);
    cookies.clear();
    assert.equal(
      (
        sqlite().prepare("SELECT count(*) AS n FROM session").get() as {
          n: number;
        }
      ).n,
      0,
    );
    assert.equal(
      (
        sqlite().prepare("SELECT count(*) AS n FROM passkey").get() as {
          n: number;
        }
      ).n,
      1,
    );
    opts = await options("authenticate");
    assert.equal(
      (
        await auth("passkey/verify-authentication", {
          response: key.authentication(opts.challenge),
        })
      ).status,
      200,
    );
    assert.equal(
      (await auth("passkey/delete-passkey", { id: credential })).status,
      200,
    );
    list = await (await auth("passkey/list-user-passkeys")).json();
    assert.deepEqual(list, []);
    await auth("sign-out", {});
    cookies.clear();
    opts = await options("authenticate");
    assert.notEqual(
      (
        await auth("passkey/verify-authentication", {
          response: key.authentication(opts.challenge),
        })
      ).status,
      200,
    );
    assert.equal(sqlite().pragma("integrity_check", { simple: true }), "ok");
  } finally {
    await stopJobWorker();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
