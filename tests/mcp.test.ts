import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
test("MCP shares content while isolating agent credentials and account administration", async (t) => {
  const directory = await mkdtemp(`${tmpdir()}/nivra-mcp-`);
  process.env.NIVRA_DATA_DIR = directory;

  const server = createServer(async (req, res) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      const request = new Request(`${base}${req.url}`, {
        method: req.method,
        headers,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? {
              body: Readable.toWeb(
                req,
              ) as unknown as ReadableStream<Uint8Array>,
              duplex: "half" as const,
            }
          : {}),
      });
      const result = await dispatch(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body)
        for await (const chunk of result.body as unknown as AsyncIterable<Uint8Array>)
          res.write(chunk);
      res.end();
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.NIVRA_PUBLIC_URL = base;
  const browser = await import("../src/app/api/nivra/[...path]/route");
  const authRoute = await import("../src/app/api/auth/[...all]/route");
  const mcp = await import("../src/app/mcp/route");
  const meta =
    await import("../src/app/.well-known/oauth-authorization-server/api/auth/route");
  const files = await import("../src/app/mcp/files/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { revokeOAuth } = await import("../src/lib/server/agent-access");
  const dispatch = async (r: Request) => {
    const p = new URL(r.url).pathname;
    if (p === "/mcp") return r.method === "POST" ? mcp.POST(r) : mcp.GET();
    if (p.startsWith("/mcp/files/"))
      return files.GET(r, {
        params: Promise.resolve({ path: p.slice(11).split("/") }),
      });
    if (p.startsWith("/api/auth/")) return authRoute.POST(r);
    if (p.startsWith("/.well-known/")) return meta.GET(r);
    return browser.GET(r, {
      params: Promise.resolve({ path: p.slice(11).split("/") }),
    });
  };
  let cookie = "";
  const human = async (path: string, body?: unknown) => {
    const r = await fetch(`${base}/api/nivra/${path}`, {
      method: body ? "POST" : "GET",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!cookie)
      cookie = r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; ");
    assert.ok(r.ok, await r.clone().text());
    return r.json();
  };
  const clients: Client[] = [];
  const connect = async (key: string) => {
    const client = new Client({ name: "Nivra test agent", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${key}` } },
      }),
    );
    clients.push(client);
    return client;
  };
  const call = async <T = Record<string, unknown>>(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ) => {
    const r = await client.callTool({ name, arguments: args });
    assert.equal(r.isError, undefined, JSON.stringify(r));
    return (r.structuredContent as { data: T }).data;
  };
  try {
    const setup = await human("setup", {
      username: "mcptester",
      name: "MCP Test",
      password: `Test-${randomUUID()}`,
    });
    assert.ok(setup.recoveryCode);
    const owner = (
      sqlite().prepare("SELECT id FROM user").get() as { id: string }
    ).id;
    let fullKey = "",
      readKey = "";
    await t.test(
      "keys are hashed, scoped, and cannot authenticate private browser APIs",
      async () => {
        const full = await human("ai-connections", {
          action: "create-key",
          name: "Full test",
          access: "full",
        });
        fullKey = full.key;
        assert.equal(
          (
            sqlite().prepare("SELECT count(*) AS n FROM jwks").get() as {
              n: number;
            }
          ).n,
          0,
          "Browser session checks must not generate unused JWT signing keys",
        );
        const read = await human("ai-connections", {
          action: "create-key",
          name: "Read test",
          access: "read",
        });
        readKey = read.key;
        assert.ok(fullKey.startsWith("nivra_"));
        assert.equal(
          sqlite().prepare("SELECT 1 FROM apikey WHERE key=?").get(fullKey),
          undefined,
        );
        const privateResponse = await fetch(`${base}/api/nivra/settings`, {
          headers: { authorization: `Bearer ${fullKey}` },
        });
        assert.equal(privateResponse.status, 401);
        const anonymous = await fetch(`${base}/mcp`, { method: "POST" });
        assert.equal(anonymous.status, 401);
        assert.match(
          anonymous.headers.get("www-authenticate")!,
          /resource_metadata/,
        );
      },
    );
    const client = await connect(fullKey);
    await t.test("SDK discovery and bounded content tools", async () => {
      const { tools } = await client.listTools();
      assert.ok(tools.some((x) => x.name === "create_note"));
      assert.ok(
        !tools.some((x) => /recovery|password|sql|backup/.test(x.name)),
      );
      assert.ok(tools.length > 35);
    });
    await t.test(
      "legacy Streamable HTTP clients initialize and list tools without a session",
      async () => {
        const headers = {
          authorization: `Bearer ${fullKey}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        };
        const invoke = (body: unknown) =>
          fetch(`${base}/mcp`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
        const initialized = await invoke({
          jsonrpc: "2.0",
          id: 71,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "Legacy test", version: "1" },
          },
        });
        assert.equal(initialized.status, 200, await initialized.clone().text());
        assert.match(await initialized.text(), /2025-11-25/);
        const listed = await invoke({
          jsonrpc: "2.0",
          id: 72,
          method: "tools/list",
          params: {},
        });
        assert.equal(listed.status, 200);
        assert.match(await listed.text(), /create_note/);
      },
    );
    let note: import("../src/lib/types").Note,
      task: import("../src/lib/types").Task,
      artifact: import("../src/lib/types").Artifact,
      tag: import("../src/lib/types").Tag;
    await t.test(
      "rich notes, Markdown append, stable block edits, revision conflicts, and retries",
      async () => {
        const input = {
          title: "MCP knowledge",
          document: {
            schemaVersion: 1,
            blocks: [
              {
                id: "keep-drawing",
                type: "canvas",
                props: { scene: '{"elements":[]}' },
                children: [],
              },
              {
                id: "paragraph",
                type: "paragraph",
                content: [{ type: "text", text: "Original", styles: {} }],
              },
            ],
          },
          idempotencyKey: "create-note-test",
        };
        note = await call<import("../src/lib/types").Note>(
          client,
          "create_note",
          input,
        );
        assert.equal(
          (
            await call<import("../src/lib/types").Note>(
              client,
              "create_note",
              input,
            )
          ).id,
          note.id,
        );
        note = await call<import("../src/lib/types").Note>(
          client,
          "append_note",
          {
            id: note.id,
            revision: note.revision,
            markdown: "## Agent addition\n\n**Indexed knowledge**",
          },
        );
        assert.equal(note.document.blocks[0].id, "keep-drawing");
        assert.match(note.text, /Indexed knowledge/);
        const conflict = await client.callTool({
          name: "update_note",
          arguments: { id: note.id, revision: 1, title: "stale" },
        });
        assert.equal(conflict.isError, true);
        note = await call<import("../src/lib/types").Note>(
          client,
          "edit_note_blocks",
          {
            id: note.id,
            revision: note.revision,
            edits: [
              {
                blockId: "paragraph",
                block: {
                  type: "paragraph",
                  content: [{ type: "text", text: "Changed", styles: {} }],
                },
              },
            ],
          },
        );
        assert.equal(note.document.blocks[0].type, "canvas");
        const changed = await client.callTool({
          name: "create_note",
          arguments: { ...input, title: "different" },
        });
        assert.equal(changed.isError, true);
        assert.ok(
          (await call<unknown[]>(client, "search", { query: "knowledge" }))
            .length,
        );
      },
    );
    await t.test(
      "journals, tasks, tags, favorites, artifacts, and processing status",
      async () => {
        const journal = await call(client, "create_journal", {
          date: "2026-10-07",
          markdown: "Daily agent journal",
        });
        assert.equal(
          (await call(client, "get_journal", { date: "2026-10-07" })).id,
          journal.id,
        );
        assert.equal(
          (
            await client.callTool({
              name: "create_journal",
              arguments: { date: "2026-10-07", markdown: "overwrite" },
            })
          ).isError,
          true,
        );
        task = await call<import("../src/lib/types").Task>(
          client,
          "create_task",
          { title: "Agent task", dueDate: "2026-10-09" },
        );
        task = await call<import("../src/lib/types").Task>(
          client,
          "update_task",
          { id: task.id, revision: task.revision, completed: true },
        );
        assert.ok(task.completedAt);
        tag = await call<import("../src/lib/types").Tag>(client, "create_tag", {
          name: "agent-tag",
        });
        await call(client, "assign_tags", {
          id: note.id,
          type: "note",
          revision: note.revision,
          tags: [tag.id],
        });
        note = await call<import("../src/lib/types").Note>(client, "get_note", {
          id: note.id,
        });
        note = await call<import("../src/lib/types").Note>(
          client,
          "update_note",
          { id: note.id, revision: note.revision, favorite: true },
        );
        assert.ok(
          (
            await call<{ items: { id: string }[] }>(
              client,
              "list_favorites",
              {},
            )
          ).items.some((x) => x.id === note.id),
        );
        artifact = await call<import("../src/lib/types").Artifact>(
          client,
          "create_text_artifact",
          { text: "Indexed artifact content" },
        );
        assert.ok(
          (
            await call<import("../src/lib/types").ArtifactDetail>(
              client,
              "get_artifact",
              { id: artifact.id },
            )
          ).content.includes("Indexed"),
        );
        assert.equal(
          (
            await call<unknown[]>(client, "processing_status", {
              kind: "artifact",
              id: artifact.id,
            })
          ).length,
          0,
        );
        assert.ok(
          sqlite()
            .prepare("SELECT 1 FROM completion_events WHERE kind='content'")
            .get(),
        );
      },
    );
    await t.test("file upload and authenticated binary transfer", async () => {
      const file = await call(client, "upload_file", {
        target: "artifact",
        name: "agent.txt",
        mime: "text/plain",
        base64: Buffer.from("Agent file").toString("base64"),
      });
      const transfer = await call(client, "file_transfer", {
        target: "artifact",
        id: file.id,
      });
      const r = await fetch(String(transfer.url), {
        headers: { authorization: `Bearer ${fullKey}` },
      });
      assert.equal(r.status, 200);
      assert.equal(await r.text(), "Agent file");
      assert.equal((await fetch(String(transfer.url))).status, 401);
    });
    await t.test(
      "read-only credentials cannot call writes and bad origins are denied",
      async () => {
        const reader = await connect(readKey);
        assert.ok(
          !(await reader.listTools()).tools.some(
            (x) => x.name === "purge_item",
          ),
        );
        assert.equal(
          (await call(reader, "get_note", { id: note.id })).id,
          note.id,
        );
        const write = await fetch(`${base}/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${readKey}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-11-25",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "create_note", arguments: { title: "denied" } },
          }),
        });
        assert.equal(write.status, 403);
        const invalid = await fetch(`${base}/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${fullKey}`,
            origin: "https://untrusted.invalid",
          },
        });
        assert.equal(invalid.status, 403);
      },
    );
    await t.test(
      "Trash is reversible and permanent deletion requires Trash",
      async () => {
        const invalid = await client.callTool({
          name: "purge_item",
          arguments: { id: task.id, kind: "task", revision: task.revision },
        });
        assert.equal(invalid.isError, true);
        await call(client, "trash_item", {
          id: task.id,
          kind: "task",
          revision: task.revision,
        });
        const trashed = (
          await call<{ items: import("../src/lib/types").TrashItem[] }>(
            client,
            "list_trash",
            {},
          )
        ).items.find((x) => x.id === task.id);
        assert.ok(trashed);
        await call(client, "restore_item", {
          id: task.id,
          kind: "task",
          revision: trashed!.revision,
        });
        task = await call<import("../src/lib/types").Task>(client, "get_task", {
          id: task.id,
        });
        await call(client, "trash_item", {
          id: task.id,
          kind: "task",
          revision: task.revision,
        });
        await call(client, "purge_item", {
          id: task.id,
          kind: "task",
          revision: task.revision + 1,
        });
      },
    );
    await t.test(
      "OAuth discovery, PKCE, consent, JWT audience and immediate revocation",
      async () => {
        const metadata = await (
          await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`)
        ).json();
        assert.equal(metadata.issuer, `${base}/api/auth`);
        assert.ok(metadata.code_challenge_methods_supported.includes("S256"));
        assert.ok(!metadata.registration_endpoint);
        const c = await human("ai-connections", {
          action: "create-client",
          name: "OAuth test",
          redirectUri: "http://localhost:9999/callback",
          public: true,
        });
        assert.ok(c.client_id);
        const verifier = randomUUID() + randomUUID();
        const challenge = createHash("sha256")
          .update(verifier)
          .digest("base64url");
        const query = new URLSearchParams({
          client_id: c.client_id,
          redirect_uri: "http://localhost:9999/callback",
          response_type: "code",
          scope: "nivra:read nivra:write offline_access",
          resource: `${base}/mcp`,
          state: "test",
          code_challenge: challenge,
          code_challenge_method: "S256",
        });
        const noPkce = new URLSearchParams(query);
        noPkce.delete("code_challenge");
        noPkce.delete("code_challenge_method");
        const deniedPkce = await fetch(
          `${base}/api/auth/oauth2/authorize?${noPkce}`,
          { headers: { cookie, accept: "text/html" }, redirect: "manual" },
        );
        assert.ok(
          deniedPkce.status >= 400 ||
            (deniedPkce.headers.get("location") || "").includes("error="),
          `Public clients must use PKCE (${deniedPkce.status}, ${await deniedPkce.clone().text()})`,
        );
        const badRedirect = new URLSearchParams(query);
        badRedirect.set("redirect_uri", "https://attacker.example/callback");
        const deniedRedirect = await fetch(
          `${base}/api/auth/oauth2/authorize?${badRedirect}`,
          { headers: { cookie, accept: "text/html" }, redirect: "manual" },
        );
        assert.ok(
          deniedRedirect.status >= 400 ||
            (deniedRedirect.headers.get("location") || "").includes("error="),
        );
        const authorize = await fetch(
          `${base}/api/auth/oauth2/authorize?${query}`,
          { headers: { cookie, accept: "text/html" }, redirect: "manual" },
        );
        assert.equal(authorize.status, 302, await authorize.clone().text());
        const consentUrl = new URL(authorize.headers.get("location")!, base);
        assert.equal(consentUrl.pathname, "/oauth/consent");
        const approved = await fetch(`${base}/api/auth/oauth2/consent`, {
          method: "POST",
          headers: { cookie, origin: base, "content-type": "application/json" },
          body: JSON.stringify({
            accept: true,
            scope: "nivra:read offline_access",
            oauth_query: consentUrl.search.slice(1),
          }),
        });
        assert.ok(approved.ok, await approved.clone().text());
        const consentResult = await approved.json();
        const code = new URL(
          consentResult.redirect_uri || consentResult.url,
        ).searchParams.get("code")!;
        const tokenResponse = await fetch(`${base}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: c.client_id,
            code,
            code_verifier: verifier,
            redirect_uri: "http://localhost:9999/callback",
            resource: `${base}/mcp`,
          }),
        });
        assert.ok(tokenResponse.ok, await tokenResponse.clone().text());
        const token = await tokenResponse.json();
        assert.ok(token.access_token);
        const { decodeJwt } = await import("jose");
        assert.deepEqual([decodeJwt(token.access_token).aud].flat(), [
          `${base}/mcp`,
        ]);
        assert.ok(
          !String(decodeJwt(token.access_token).scope).includes("nivra:write"),
        );

        const oauth = await connect(token.access_token);
        assert.equal(
          (await call(oauth, "get_note", { id: note.id })).id,
          note.id,
        );
        sqlite()
          .prepare("INSERT OR REPLACE INTO agent_rate_limits VALUES(?,?,?)")
          .run(`oauth:${c.client_id}`, Date.now(), 120);
        const limited = await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { authorization: `Bearer ${token.access_token}` },
        });
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get("retry-after"), "60");
        const startedAt = Date.now() - 1;
        revokeOAuth(owner, c.client_id);
        const { captureOAuthToken } =
          await import("../src/lib/server/agent-auth");
        const late = await captureOAuthToken(
          new Request(`${base}/api/auth/oauth2/token`, { method: "POST" }),
          Response.json(token),
          startedAt,
        );
        assert.equal(late.status, 400);
        const revoked = await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { authorization: `Bearer ${token.access_token}` },
        });
        assert.equal(revoked.status, 401);
        const refreshed = await fetch(`${base}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: c.client_id,
            refresh_token: token.refresh_token,
            resource: `${base}/mcp`,
          }),
        });
        assert.equal(refreshed.status, 400);
      },
    );
    await t.test(
      "agent keys, signing keys, grants and token revocations survive encrypted backup recovery",
      async () => {
        const backups = await import("../src/lib/server/backups");
        const backup = await backups.createBackup();
        await backups.verifyBackup(backup.id);
        const target = `${directory}/restored`;
        await backups.restoreBackup(backup.id, target);
        const { default: Database } = await import("better-sqlite3");
        const { deriveKey, masterKey } =
          await import("../src/lib/server/encryption");
        const restored = new Database(`${target}/nivra.sqlite`);
        try {
          restored.pragma("cipher = 'chacha20'");
          restored.pragma(
            `key = '${deriveKey(masterKey(directory), "sqlite").toString("hex")}'`,
          );
          assert.equal(
            restored.pragma("integrity_check", { simple: true }),
            "ok",
          );
          for (const table of [
            "apikey",
            "jwks",
            "oauth_client",
            "agent_revocations",
            "agent_idempotency",
          ])
            assert.deepEqual(
              restored.prepare(`SELECT count(*) AS count FROM ${table}`).get(),
              sqlite().prepare(`SELECT count(*) AS count FROM ${table}`).get(),
            );
        } finally {
          restored.close();
        }
      },
    );
    await t.test("API key revocation is immediate", async () => {
      const stored = sqlite()
        .prepare("SELECT id FROM apikey WHERE name='Read test'")
        .get() as { id: string };
      await human("ai-connections", { action: "revoke-key", id: stored.id });
      assert.equal(
        (
          await fetch(`${base}/mcp`, {
            method: "POST",
            headers: { authorization: `Bearer ${readKey}` },
          })
        ).status,
        401,
      );
    });
  } finally {
    for (const c of clients) await c.close();
    const { stopJobWorker } = await import("../src/lib/server/jobs");
    await stopJobWorker();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
