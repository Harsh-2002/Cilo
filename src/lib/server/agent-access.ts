import { createHash } from "node:crypto";
import { sqlite } from "./db";
import { HttpError } from "./http";
export type AgentPrincipal = {
  ownerId: string;
  connectionId: string;
  scopes: string[];
};
export const agentScopes = ["nivra:read", "nivra:write"];
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function authorizeContentPath(
  principal: AgentPrincipal,
  path: string[],
  method: string,
) {
  if (
    ![
      "notes",
      "tasks",
      "bookmarks",
      "artifacts",
      "tags",
      "item-tags",
      "favorites",
      "trash",
      "files",
      "search",
      "overview",
      "calendar",
      "export",
      "import",
    ].includes(path[0])
  )
    throw new HttpError(403, "Agents cannot administer this instance.");
  if (
    !principal.scopes.includes("nivra:read") ||
    (method !== "GET" &&
      path[0] !== "export" &&
      !principal.scopes.includes("nivra:write"))
  )
    throw new HttpError(
      403,
      "This connection does not have permission to change content.",
    );
  if (path[0] === "calendar" && path[1] === "subscriptions")
    throw new HttpError(403, "Enable device notifications in the app.");
  if (method !== "GET") {
    if (
      path[0] === "trash" ||
      (path[0] === "notes" && path.length === 2 && method === "DELETE")
    )
      throw new HttpError(
        403,
        "Agents cannot restore or permanently delete items. Trash is read-only.",
      );
    const tables: Record<string, string> = {
      notes: "notes",
      tasks: "tasks",
      bookmarks: "bookmarks",
      artifacts: "artifacts",
    };
    const table = tables[path[0]];
    if (
      table &&
      path[1] &&
      sqlite()
        .prepare(
          `SELECT 1 FROM ${table} WHERE id=? AND owner_id=? AND trashed_at IS NOT NULL`,
        )
        .get(path[1], principal.ownerId)
    )
      throw new HttpError(403, "Agents cannot change items in Trash.");
  }
}
export function revokeOAuth(owner: string, client: string) {
  const d = sqlite();
  d.transaction(() => {
    d.prepare("INSERT OR REPLACE INTO agent_revocations VALUES(?,?,?)").run(
      owner,
      client,
      Date.now(),
    );
    d.prepare("DELETE FROM agent_tokens WHERE owner_id=? AND client_id=?").run(
      owner,
      client,
    );
    d.prepare(
      "DELETE FROM oauth_access_token WHERE user_id=? AND client_id=?",
    ).run(owner, client);
    d.prepare(
      "DELETE FROM oauth_refresh_token WHERE user_id=? AND client_id=?",
    ).run(owner, client);
    d.prepare("DELETE FROM oauth_consent WHERE user_id=? AND client_id=?").run(
      owner,
      client,
    );
    d.prepare(
      "DELETE FROM verification WHERE json_valid(value) AND json_extract(value,'$.query.client_id')=?",
    ).run(client);
    d.prepare("DELETE FROM agent_idempotency WHERE connection_id=?").run(
      `oauth:${client}`,
    );
    d.prepare("DELETE FROM agent_rate_limits WHERE connection_id=?").run(
      `oauth:${client}`,
    );
  }).immediate();
}
export function revokeAllAgents(owner: string) {
  const d = sqlite();
  d.prepare("INSERT OR REPLACE INTO agent_revocations VALUES(?,?,?)").run(
    owner,
    "*",
    Date.now(),
  );
  d.prepare("DELETE FROM agent_tokens WHERE owner_id=?").run(owner);
  d.prepare("DELETE FROM oauth_access_token WHERE user_id=?").run(owner);
  d.prepare("DELETE FROM oauth_refresh_token WHERE user_id=?").run(owner);
  d.prepare("DELETE FROM oauth_consent WHERE user_id=?").run(owner);
  d.prepare("DELETE FROM apikey WHERE reference_id=?").run(owner);
  d.prepare(
    "DELETE FROM verification WHERE json_valid(value) AND json_extract(value,'$.query.client_id') IS NOT NULL",
  ).run();
  d.prepare("DELETE FROM agent_idempotency").run();
  d.prepare("DELETE FROM agent_rate_limits").run();
}
