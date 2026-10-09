import { withAgent, agentChallenge } from "@/lib/server/agent-auth";
import { handleWorkspace } from "@/lib/server/workspace-api";
import { response } from "@/lib/server/http";
import { completionEvent } from "@/lib/server/jobs";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return withAgent(request, async (principal) => {
    const { path } = await context.params;
    const [target, id] = path;
    let route: string;
    const method = request.method;
    if (
      path.length === 2 &&
      method === "GET" &&
      z.string().uuid().safeParse(id).success &&
      ["artifact", "attachment"].includes(target)
    )
      route = target === "artifact" ? `artifacts/${id}/file` : `files/${id}`;
    else if (
      path.length === 1 &&
      method === "POST" &&
      ["upload-artifact", "upload-attachment", "import-bundle"].includes(target)
    ) {
      if (!principal.scopes.includes("nivra:write"))
        return agentChallenge(request, 403, "nivra:write");
      route =
        target === "upload-artifact"
          ? "artifacts"
          : target === "upload-attachment"
            ? "files"
            : "import/bundle";
    } else if (
      path.length === 1 &&
      target === "export-bundle" &&
      method === "GET"
    ) {
      route = "export/bundle";
    } else
      return response(
        { error: "This file transfer route was not found." },
        404,
      );
    const result = await handleWorkspace(
      request,
      { params: Promise.resolve({ path: route.split("/") }) },
      principal,
    );
    if (result.ok && request.method === "POST")
      completionEvent(principal.ownerId, "content", "", "changed");
    return result;
  });
}
export { handle as GET, handle as POST };
