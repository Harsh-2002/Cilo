import { handleWorkspace } from "@/lib/server/workspace-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handleWorkspace(request, context);
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
