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
      assert.ok(setup.snippets[0].value.includes(endpoint));
      assert.equal(setup.snippets[0].value.includes(token), mode === "key");
      assert.equal(setup.snippets[0].value.includes("NIVRA_API_KEY"), false);
      if (["cursor", "opencode"].includes(client.id))
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
