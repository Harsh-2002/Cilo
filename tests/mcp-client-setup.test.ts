import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mcpClients, mcpClientSetup } from "../src/lib/mcp-client-setup";
test("MCP client setup uses the supplied origin and inline credentials", () => {
  const endpoint = "https://example.com/mcp";
  const token = "test-only-token";
  for (const client of mcpClients)
    for (const mode of ["oauth", "key"] as const) {
      const setup = mcpClientSetup(client.id, mode, endpoint, token);
      const snippet = setup.snippets[0].value;
      if (client.id === "cursor")
        assert.equal(JSON.parse(snippet).mcpServers.nivra.url, endpoint);
      else if (client.id === "opencode")
        assert.equal(JSON.parse(snippet).mcp.nivra.url, endpoint);
      else if (client.id === "openclaw")
        assert.equal(JSON.parse(snippet).mcp.servers.nivra.url, endpoint);
      else if (client.id === "codex" && mode === "oauth")
        assert.equal(
          snippet.split("\n")[0],
          `codex mcp add nivra --url '${endpoint}'`,
        );
      else if (client.id === "claude")
        assert.equal(
          snippet,
          `claude mcp add --transport http --scope user nivra '${endpoint}'${mode === "oauth" ? "\nclaude mcp login nivra" : ` --header 'Authorization: Bearer ${token}'`}`,
        );
      else
        assert.equal(
          JSON.parse(snippet.match(/^\s*url\s*[:=]\s*(.+)$/m)![1]),
          endpoint,
        );
      assert.equal(setup.snippets[0].value.includes(token), mode === "key");
      assert.equal(setup.snippets[0].value.includes("NIVRA_API_KEY"), false);
      if (["cursor", "opencode", "openclaw"].includes(client.id))
        assert.doesNotThrow(() => JSON.parse(setup.snippets[0].value));
    }
  assert.match(
    mcpClientSetup("codex", "oauth", endpoint).snippets[0].value,
    /login nivra --scopes nivra:read,nivra:write/,
  );
  assert.equal(
    mcpClientSetup("codex", "key", endpoint, token).snippets[0].value,
    `[mcp_servers.nivra]\nurl = "${endpoint}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
  );
  assert.match(
    mcpClientSetup("claude", "oauth", endpoint).snippets[0].value,
    /claude mcp login nivra/,
  );
  const open = JSON.parse(
    mcpClientSetup("opencode", "key", endpoint, token).snippets[0].value,
  );
  assert.equal(open.mcp.nivra.oauth, false);
  assert.equal(open.mcp.nivra.headers.Authorization, `Bearer ${token}`);
  const cursor = JSON.parse(
    mcpClientSetup("cursor", "key", endpoint, token).snippets[0].value,
  );
  assert.equal(
    cursor.mcpServers.nivra.headers.Authorization,
    `Bearer ${token}`,
  );
});
test("CLI quoting keeps endpoints and inline credentials literal", () => {
  const endpoint = "https://example.com/mcp/'$(touch%20bad)'";
  const token = "test-'$(printf bad)'-token";
  const command = mcpClientSetup("claude", "key", endpoint, token).snippets[0]
    .value;
  const args = execFileSync(
    "bash",
    ["-c", `claude() { printf '%s\\n' "$@"; }\n${command}`],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  assert.equal(args[7], endpoint);
  assert.equal(args[9], `Authorization: Bearer ${token}`);
  assert.throws(() => mcpClientSetup("codex", "oauth", "file:///tmp/mcp"));
  assert.throws(() =>
    mcpClientSetup("cursor", "key", "https://secret@example.com/mcp"),
  );
  assert.throws(() =>
    mcpClientSetup("claude", "key", "https://example.com/mcp", "bad\nheader"),
  );
  const config = mcpClientSetup(
    "codex",
    "key",
    "https://example.com/mcp",
    token,
  ).snippets[0].value;
  assert.ok(config.includes(JSON.stringify(`Bearer ${token}`)));
});

test("OpenClaw and Hermes setup selects native HTTP auth formats", () => {
  const endpoint = "https://example.com/mcp",
    token = "test-only-token";
  const key = JSON.parse(
    mcpClientSetup("openclaw", "key", endpoint, token).snippets[0].value,
  );
  assert.equal(key.mcp.servers.nivra.transport, "streamable-http");
  assert.equal(key.mcp.servers.nivra.headers.Authorization, `Bearer ${token}`);
  const oauth = JSON.parse(
    mcpClientSetup("openclaw", "oauth", endpoint).snippets[0].value,
  );
  assert.equal(oauth.mcp.servers.nivra.auth, "oauth");
  assert.equal(oauth.mcp.servers.nivra.headers, undefined);
  assert.equal(
    mcpClientSetup("openclaw", "oauth", endpoint).snippets[1].value,
    "openclaw mcp login nivra",
  );
  assert.equal(
    mcpClientSetup("hermes", "key", endpoint, token).snippets[0].value,
    `mcp_servers:\n  nivra:\n    url: "${endpoint}"\n    headers:\n      Authorization: "Bearer ${token}"`,
  );
  assert.match(
    mcpClientSetup("hermes", "oauth", endpoint).snippets[0].value,
    /auth: oauth/,
  );
  assert.equal(
    mcpClientSetup("hermes", "oauth", endpoint).snippets[1].value,
    "hermes mcp login nivra",
  );
});
