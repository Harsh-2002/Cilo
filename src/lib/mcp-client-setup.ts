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
) {
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid MCP endpoint.");
  const quoted = shellQuote(url.href);
  const oauth = authentication === "oauth";
  if (client === "codex")
    return {
      label: "Terminal",
      hint: oauth
        ? "Run these commands, then approve access in your browser."
        : "Set NIVRA_API_KEY in your environment before starting Codex.",
      snippets: [
        {
          label: "Command",
          value: `codex mcp add nivra --url ${quoted}${oauth ? "\ncodex mcp login nivra --scopes nivra:read,nivra:write" : " --bearer-token-env-var NIVRA_API_KEY"}`,
        },
      ],
    };
  if (client === "claude")
    return {
      label: "Terminal",
      hint: oauth
        ? "Run these commands, then approve access in your browser."
        : "Set NIVRA_API_KEY in your environment before running this command.",
      snippets: [
        {
          label: "Command",
          value: `claude mcp add --transport http --scope user nivra ${quoted}${oauth ? "\nclaude mcp login nivra" : " --header 'Authorization: Bearer ${NIVRA_API_KEY}'"}`,
        },
      ],
    };
  if (client === "opencode")
    return {
      label: "opencode.json",
      hint: oauth
        ? "Merge this into your config, then run the authentication command."
        : "Merge this into your config. Set NIVRA_API_KEY in your client environment.",
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
                          Authorization: "Bearer {env:NIVRA_API_KEY}",
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
      : "Merge this into your config. Set NIVRA_API_KEY before starting Cursor.",
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
                      headers: { Authorization: "Bearer ${env:NIVRA_API_KEY}" },
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
