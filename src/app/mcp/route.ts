import { createMcpHandler } from "@modelcontextprotocol/server";
import { withAgent, agentChallenge } from "@/lib/server/agent-auth";
import { createAgentServer, writeTools } from "@/lib/server/mcp-tools";
import {
  checkOrigin,
  HttpError,
  readLimited,
  requestOrigin,
  response,
} from "@/lib/server/http";
import type { AgentPrincipal } from "@/lib/server/agent-access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createMcpHandler(
  ({ authInfo, requestInfo }) => {
    if (!authInfo?.extra || !requestInfo)
      throw new Error("An authenticated principal is required.");
    return createAgentServer(
      authInfo.extra as AgentPrincipal,
      requestOrigin(requestInfo),
    );
  },
  { legacy: "stateless", maxRequestBodySize: 4 * 1024 * 1024 },
);
export async function POST(request: Request) {
  return withAgent(request, async (principal) => {
    try {
      const bytes = await readLimited(request, 4 * 1024 * 1024);
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (
        body?.method === "tools/call" &&
        writeTools.has(body.params?.name) &&
        !principal.scopes.includes("nivra:write")
      )
        return agentChallenge(request, 403, "nivra:write");
      const result = await handler.fetch(request, {
        parsedBody: body,
        authInfo: {
          token: "",
          clientId: principal.connectionId,
          scopes: principal.scopes,
          extra: principal,
        },
      });
      result.headers.set("Cache-Control", "no-store");
      result.headers.set("X-Accel-Buffering", "no");
      return result;
    } catch (e) {
      return response(
        { error: e instanceof HttpError ? e.message : "Invalid MCP request." },
        e instanceof HttpError ? e.status : 400,
      );
    }
  });
}
export function GET() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
  });
}
export const DELETE = GET;
export function OPTIONS(request: Request) {
  try {
    checkOrigin(request);
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "POST, OPTIONS",
        "Access-Control-Allow-Origin": requestOrigin(request),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return response({ error: "Origin is not allowed." }, 403);
  }
}
