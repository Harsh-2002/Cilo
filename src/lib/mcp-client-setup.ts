export const mcpClients = [
  { id: "codex", name: "Codex CLI" },
  { id: "claude", name: "Claude Code" },
  { id: "opencode", name: "OpenCode" },
  { id: "cursor", name: "Cursor" },
] as const;
export type McpClient = (typeof mcpClients)[number]["id"];
export type McpAuthentication = "oauth" | "key";
const shellQuote = (value: string) =>
  "'" + value.replaceAll("'", "'\"'\"'") + "'";
export function mcpClientSetup(
  client: McpClient,
  authentication: McpAuthentication,
  endpoint: string,
  token = "YOUR_API_KEY",
) {
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid MCP endpoint.");
  if (!token || /[\r\n\x00-\x1f]/.test(token))
    throw new Error("Invalid MCP credential.");
  const bearer = `Bearer ${token}`;
  const quoted = shellQuote(url.href);
  const oauth = authentication === "oauth";
  if (client === "codex")
    return oauth
      ? {
          label: "Terminal",
          hint: "Run these commands, then approve access in your browser.",
          snippets: [
            {
              label: "Command",
              value: `codex mcp add nivra --url ${quoted}\ncodex mcp login nivra --scopes nivra:read,nivra:write`,
            },
          ],
        }
      : {
          label: "~/.codex/config.toml",
          hint: "Merge this into your Codex config.",
          snippets: [
            {
              label: "~/.codex/config.toml",
              value: `[mcp_servers.nivra]\nurl = ${JSON.stringify(url.href)}\nhttp_headers = { Authorization = ${JSON.stringify(bearer)} }`,
            },
          ],
        };
  if (client === "claude")
    return {
      label: "Terminal",
      hint: oauth
        ? "Run these commands, then approve access in your browser."
        : "Run this command to connect.",
      snippets: [
        {
          label: "Command",
          value: `claude mcp add --transport http --scope user nivra ${quoted}${oauth ? "\nclaude mcp login nivra" : ` --header ${shellQuote("Authorization: " + bearer)}`}`,
        },
      ],
    };
  if (client === "opencode")
    return {
      label: "opencode.json",
      hint: oauth
        ? "Merge this into your config, then run the authentication command."
        : "Merge this into your config.",
      snippets: [
        {
          label: "opencode.json",
          value: JSON.stringify(
            {
              $schema: "https://opencode.ai/config.json",
              mcp: {
                nivra: {
                  type: "remote",
                  url: url.href,
                  ...(oauth
                    ? {}
                    : {
                        oauth: false,
                        headers: {
                          Authorization: bearer,
                        },
                      }),
                },
              },
            },
            null,
            2,
          ),
        },
        ...(oauth
          ? [{ label: "Command", value: "opencode mcp auth nivra" }]
          : []),
      ],
    };
  return {
    label: ".cursor/mcp.json",
    hint: oauth
      ? "Merge this into your config, then connect in Cursor’s MCP settings."
      : "Merge this into your config.",
    snippets: [
      {
        label: ".cursor/mcp.json",
        value: JSON.stringify(
          {
            mcpServers: {
              nivra: {
                url: url.href,
                ...(oauth
                  ? {}
                  : {
                      headers: { Authorization: bearer },
                    }),
              },
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}
