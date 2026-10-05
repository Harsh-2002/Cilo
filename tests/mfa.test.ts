import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac, randomUUID } from "node:crypto";
function totp(uri: string) {
  const secret = new URL(uri).searchParams.get("secret")!;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase()]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const bytes = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, i) =>
      parseInt(bits.slice(i * 8, i * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", bytes).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
test("optional TOTP verifies enrollment, challenges login, consumes backup codes, and recovers safely", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-mfa-test-"));
  process.env.NIVRA_DATA_DIR = directory;
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const authRoute = await import("../src/app/api/auth/[...all]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const cookies = new Map<string, string>();
  const password = `Test-${randomUUID()}`;
  const makeRequest = (route: string, body?: unknown) =>
    new Request(`http://localhost:3000${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: [...cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const saveCookies = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";")[0];
      const index = first.indexOf("=");
      const name = first.slice(0, index),
        value = first.slice(index + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return response;
  };
  const nivra = async (route: string, body?: unknown) =>
    saveCookies(
      await routes.GET(makeRequest(`/api/nivra/${route}`, body), {
        params: Promise.resolve({ path: route.split("/") }),
      }),
    );
  const auth = async (route: string, body: unknown) =>
    saveCookies(await authRoute.POST(makeRequest(`/api/auth/${route}`, body)));
  try {
    const setup = await nivra("setup", {
      username: "mfater",
      name: "MFA Owner",
      password,
    });
    assert.equal(setup.status, 200);
    const recoveryCode = (await setup.json()).recoveryCode;
    assert.equal(
      (await auth("two-factor/enable", { password: "wrong" })).status,
      400,
    );
    const enrollmentResponse = await auth("two-factor/enable", {
      password,
      method: "totp",
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json();
    assert.equal(enrollment.method, "totp");
    assert.ok(enrollment.backupCodes.length > 0);
    assert.equal(
      (await (await nivra("settings")).json()).twoFactorEnabled,
      false,
    );
    const valid = totp(enrollment.totpURI);
    const invalid = valid === "000000" ? "111111" : "000000";
    assert.equal(
      (await auth("two-factor/verify-totp", { code: invalid })).status,
      401,
    );
    assert.equal(
      (await auth("two-factor/verify-totp", { code: totp(enrollment.totpURI) }))
        .status,
      200,
    );
    assert.equal(
      (await (await nivra("settings")).json()).twoFactorEnabled,
      true,
    );
    await auth("sign-out", {});
    cookies.clear();
    const passwordOnly = await auth("sign-in/username", {
      username: "mfater",
      password,
    });
    assert.equal((await passwordOnly.json()).twoFactorRedirect, true);
    assert.equal((await nivra("notes")).status, 401);
    assert.equal(
      (await auth("two-factor/verify-totp", { code: invalid })).status,
      401,
    );
    assert.equal(
      (await auth("two-factor/verify-totp", { code: totp(enrollment.totpURI) }))
        .status,
      429,
    );
    await delay(10100);
    assert.equal(
      (await auth("two-factor/verify-totp", { code: totp(enrollment.totpURI) }))
        .status,
      200,
    );
    assert.equal((await nivra("notes")).status, 200);
    await auth("sign-out", {});
    cookies.clear();
    await auth("sign-in/username", { username: "mfater", password });
    const backup = enrollment.backupCodes[0];
    assert.equal(
      (await auth("two-factor/verify-backup-code", { code: backup })).status,
      200,
    );
    await auth("sign-out", {});
    cookies.clear();
    await auth("sign-in/username", { username: "mfater", password });
    assert.equal(
      (await auth("two-factor/verify-backup-code", { code: backup })).status,
      401,
    );
    assert.equal(
      (await auth("two-factor/verify-totp", { code: totp(enrollment.totpURI) }))
        .status,
      200,
    );
    assert.equal(
      (await auth("two-factor/disable", { password: "wrong" })).status,
      400,
    );
    assert.equal((await auth("two-factor/disable", { password })).status, 200);
    assert.equal(
      (await (await nivra("settings")).json()).twoFactorEnabled,
      false,
    );
    const reenrollment = await (
      await auth("two-factor/enable", { password, method: "totp" })
    ).json();
    assert.equal(
      (
        await auth("two-factor/verify-totp", {
          code: totp(reenrollment.totpURI),
        })
      ).status,
      200,
    );
    const newPassword = `New-${randomUUID()}`;
    assert.equal(
      (await nivra("recover", { code: recoveryCode, password: newPassword }))
        .status,
      200,
    );
    assert.equal(
      (
        sqlite().prepare("SELECT count(*) AS n FROM two_factor").get() as {
          n: number;
        }
      ).n,
      0,
    );
    assert.equal((await nivra("notes")).status, 401);
    cookies.clear();
    const recovered = await auth("sign-in/username", {
      username: "mfater",
      password: newPassword,
    });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).twoFactorRedirect, undefined);
    assert.equal((await nivra("notes")).status, 200);
  } finally {
    sqlite().close();
    delete (globalThis as unknown as { nivraSqlite?: unknown }).nivraSqlite;
    await rm(directory, { recursive: true, force: true });
  }
});
