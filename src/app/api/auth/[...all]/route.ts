import { captureOAuthToken } from "@/lib/server/agent-auth";
import { auth } from "@/lib/server/auth";
import { tokenHash } from "@/lib/server/agent-access";
import { sqlite } from "@/lib/server/db";
import { HttpError, readLimited, response } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const startedAt = Date.now();
  const revoking =
    request.method === "POST" &&
    new URL(request.url).pathname.endsWith("/oauth2/revoke");
  let revokedToken: unknown;
  if (revoking) {
    try {
      const body = new TextDecoder().decode(
        await readLimited(request.clone(), 16384),
      );
      revokedToken = request.headers
        .get("content-type")
        ?.includes("application/json")
        ? JSON.parse(body).token
        : new URLSearchParams(body).get("token");
    } catch (error) {
      return response(
        { error: "invalid_request" },
        error instanceof HttpError ? error.status : 400,
      );
    }
  }
  const result = await auth(request).handler(request);
  if (revoking && result.ok && typeof revokedToken === "string")
    sqlite()
      .prepare("DELETE FROM agent_tokens WHERE token_hash=?")
      .run(tokenHash(revokedToken));
  if (
    request.method === "GET" &&
    new URL(request.url).pathname.endsWith("/oauth2/authorize") &&
    result.ok &&
    result.headers.get("content-type")?.includes("application/json")
  ) {
    const body = await result.clone().json();
    if (body.redirect === true && typeof body.url === "string") {
      const headers = new Headers(result.headers);
      headers.delete("content-type");
      headers.set("location", new URL(body.url, request.url).href);
      headers.set("cache-control", "no-store");
      return new Response(null, { status: 302, headers });
    }
  }
  return captureOAuthToken(request, result, startedAt);
}
export { handle as GET, handle as POST };
