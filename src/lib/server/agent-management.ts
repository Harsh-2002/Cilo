import { z } from "zod";
import { auth } from "./auth";
import { sqlite } from "./db";
import { json, response, HttpError, requestOrigin } from "./http";
import { revokeOAuth } from "./agent-access";
import { passkeyFreshSeconds } from "./passkeys";
export async function agentManagement(
  request: Request,
  owner: string,
  createdAt: Date | string,
) {
  if (request.method === "GET") {
    const keys = sqlite()
      .prepare(
        "SELECT id,name,start,permissions,expires_at AS expiresAt,last_request AS lastUsed,created_at AS createdAt FROM apikey WHERE reference_id=? ORDER BY created_at DESC",
      )
      .all(owner);
    const connections = sqlite()
      .prepare(
        "SELECT c.client_id AS clientId,c.name,max(t.created_at) AS lastUsed,c.redirect_uris AS redirectUris FROM oauth_client c LEFT JOIN agent_tokens t ON t.client_id=c.client_id AND t.owner_id=? WHERE EXISTS(SELECT 1 FROM oauth_consent s WHERE s.client_id=c.client_id AND s.user_id=?) GROUP BY c.client_id ORDER BY c.created_at DESC",
      )
      .all(owner, owner);
    return response({
      endpoint: `${requestOrigin(request)}/mcp`,
      keys,
      connections,
    });
  }
  if (Date.now() - new Date(createdAt).getTime() >= passkeyFreshSeconds * 1000)
    throw new HttpError(403, "Sign in again before managing AI credentials.");
  const input = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("create-key"),
        name: z.string().trim().min(1).max(80),
        access: z.enum(["read", "full"]),
        expiresIn: z.number().int().min(60).max(31536000).optional(),
      }),
      z.object({
        action: z.literal("revoke-key"),
        id: z.string().min(1).max(200),
      }),
      z.object({
        action: z.literal("revoke-oauth"),
        clientId: z.string().min(1).max(4096),
      }),
      z.object({
        action: z.literal("create-client"),
        name: z.string().trim().min(1).max(80),
        redirectUri: z.url().max(4096),
        public: z.boolean().default(false),
      }),
    ])
    .parse(await json(request));
  if (input.action === "create-key") {
    const key = await auth(request).api.createApiKey({
      body: {
        userId: owner,
        name: input.name,
        expiresIn: input.expiresIn,
        permissions: {
          nivra: input.access === "full" ? ["read", "write"] : ["read"],
        },
      },
    });
    return response({ key: key.key, id: key.id }, 201);
  }
  if (input.action === "revoke-key") {
    if (
      !sqlite()
        .prepare("SELECT 1 FROM apikey WHERE id=? AND reference_id=?")
        .get(input.id, owner)
    )
      throw new HttpError(404, "This key was not found.");
    await auth(request).api.deleteApiKey({
      headers: request.headers,
      body: { keyId: input.id },
    });
    sqlite()
      .prepare("DELETE FROM agent_idempotency WHERE connection_id=?")
      .run(`key:${input.id}`);
    return response({ ok: true });
  }
  if (input.action === "revoke-oauth") {
    revokeOAuth(owner, input.clientId);
    return response({ ok: true });
  }
  const uri = new URL(input.redirectUri);
  if (typeof auth(request).api.createOAuthClient !== "function")
    throw new HttpError(
      400,
      "OAuth requires HTTPS or a loopback origin. API keys can still be used here.",
    );
  if (
    uri.protocol !== "https:" &&
    !(
      uri.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname)
    )
  )
    throw new HttpError(400, "Use an HTTPS callback or a localhost callback.");
  const client = await auth(request).api.createOAuthClient({
    headers: request.headers,
    body: {
      application_type: uri.protocol === "http:" ? "native" : "web",
      client_name: input.name,
      redirect_uris: [input.redirectUri],
      token_endpoint_auth_method: input.public ? "none" : "client_secret_post",
      grant_types: ["authorization_code", "refresh_token"],
      scope: "nivra:read nivra:write offline_access",
    },
  });
  return response(client, 201);
}
