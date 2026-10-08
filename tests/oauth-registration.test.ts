import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

test("automatic OAuth registration bounds requests and infers loopback clients without granting access", async () => {
  const directory = await mkdtemp(`${tmpdir()}/nivra-dcr-`);
  process.env.NIVRA_DATA_DIR = directory;
  const { prepareOAuthRegistration } =
    await import("../src/lib/server/oauth-registration");
  const { sqlite } = await import("../src/lib/server/db");
  const request = (body: unknown) =>
    new Request("http://localhost/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const normalized = await prepareOAuthRegistration(
      request({
        redirect_uris: ["http://127.0.0.1:1234/callback"],
        token_endpoint_auth_method: "none",
      }),
    );
    assert.equal((await normalized.json()).application_type, "native");
    assert.equal(
      (
        sqlite().prepare("SELECT count(*) AS n FROM oauth_client").get() as {
          n: number;
        }
      ).n,
      0,
    );
    for (const body of [
      { redirect_uris: Array(11).fill("https://client.example/callback") },
      {
        redirect_uris: ["https://client.example/callback"],
        skip_consent: true,
      },
      {
        redirect_uris: ["https://client.example/callback"],
        require_pkce: false,
      },
      { redirect_uris: [], client_name: "x".repeat(201) },
    ])
      await assert.rejects(
        prepareOAuthRegistration(request(body)),
        (error: unknown) => (error as { status: number }).status === 400,
      );
    await assert.rejects(
      prepareOAuthRegistration(request({ padding: "x".repeat(17000) })),
      (error: unknown) => (error as { status: number }).status === 413,
    );
    sqlite().transaction(() => {
      for (let i = 0; i < 200; i++)
        sqlite()
          .prepare(
            "INSERT INTO oauth_client(id,client_id,redirect_uris) VALUES(?,?,?)",
          )
          .run(
            randomUUID(),
            randomUUID(),
            JSON.stringify(["https://client.example/callback"]),
          );
    })();
    await assert.rejects(
      prepareOAuthRegistration(
        request({ redirect_uris: ["https://client.example/callback"] }),
      ),
      (error: unknown) => (error as { status: number }).status === 429,
    );
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
