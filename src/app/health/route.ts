import { validateApiResponse } from "@/lib/server/api-validation";
import { handleWorkspace } from "@/lib/server/workspace-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const response = await handleWorkspace(request, {
    params: Promise.resolve({ path: ["health"] }),
  });
  return validateApiResponse(
    request,
    response.status >= 500
      ? new Response(response.body, { status: 503, headers: response.headers })
      : response,
  );
}
