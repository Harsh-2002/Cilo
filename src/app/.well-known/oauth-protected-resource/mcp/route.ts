import { agentResource } from "@/lib/server/agent-auth";
import { requestOrigin, response } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return response({
    resource: agentResource(request),
    authorization_servers: [`${requestOrigin(request)}/api/auth`],
    scopes_supported: ["nivra:read", "nivra:write"],
    bearer_methods_supported: ["header"],
    resource_name: "Nivra",
  });
}
