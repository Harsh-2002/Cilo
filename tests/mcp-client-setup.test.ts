import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mcpClients, mcpClientSetup } from "../src/lib/mcp-client-setup";
test("MCP client setup uses the supplied origin and supported authentication formats", () => {
  const endpoint = "https://example.com/mcp";
  for (const client of mcpClients)
    for (const mode of ["oauth", "key"] as const) {
      const setup = mcpClientSetup(client.id, mode, endpoint);
      assert.ok(setup.snippets[0].value.includes(endpoint));
      assert.equal(
        setup.snippets[0].value.includes("NIVRA_API_KEY"),
        mode === "key",
      );
      if (["cursor", "opencode"].includes(client.id))
        assert.doesNotThrow(() => JSON.parse(setup.snippets[0].value));
    }
  assert.match(
    mcpClientSetup("codex", "oauth", endpoint).snippets[0].value,
    /login nivra --scopes nivra:read,nivra:write/,
  );
  assert.match(
    mcpClientSetup("codex", "key", endpoint).snippets[0].value,
    /--bearer-token-env-var NIVRA_API_KEY/,
  );
  assert.match(
    mcpClientSetup("claude", "oauth", endpoint).snippets[0].value,
    /claude mcp login nivra/,
  );
  assert.ok(
    mcpClientSetup("claude", "key", endpoint).snippets[0].value.endsWith(
      "--header 'Authorization: Bearer ${NIVRA_API_KEY}'",
    ),
  );
  const open = JSON.parse(
    mcpClientSetup("opencode", "key", endpoint).snippets[0].value,
  );
  assert.equal(open.mcp.nivra.oauth, false);
  assert.equal(
    open.mcp.nivra.headers.Authorization,
    "Bearer {env:NIVRA_API_KEY}",
  );
  const cursor = JSON.parse(
    mcpClientSetup("cursor", "key", endpoint).snippets[0].value,
  );
  assert.equal(
    cursor.mcpServers.nivra.headers.Authorization,
    "Bearer ${env:NIVRA_API_KEY}",
  );
});
test("CLI endpoint quoting prevents shell interpolation and rejects non-HTTP URLs", () => {
  const command = mcpClientSetup(
    "codex",
    "key",
    "https://example.com/mcp/'$(touch%20bad)'",
  ).snippets[0].value;
  assert.ok(command.includes("'\"'\"'"));
  const args = execFileSync(
    "bash",
    ["-c", `codex() { printf '%s\\n' "$@"; }\n${command}`],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  assert.equal(args[4], "https://example.com/mcp/'$(touch%20bad)'");
  assert.throws(() => mcpClientSetup("codex", "oauth", "file:///tmp/mcp"));
  assert.throws(() =>
    mcpClientSetup("cursor", "key", "https://secret@example.com/mcp"),
  );
});
