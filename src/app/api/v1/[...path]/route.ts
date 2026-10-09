import { withAgent } from "@/lib/server/agent-auth";
import {
  apiOperations,
  matches,
  operationFor,
} from "@/lib/server/api-contract";
import {
  apiFailure,
  validateApiResponse,
  validateQuery,
  validatePath,
} from "@/lib/server/api-validation";
import { HttpError } from "@/lib/server/http";
import { handleWorkspace } from "@/lib/server/workspace-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const url = new URL(request.url);
    const operation = operationFor(url.pathname, request.method);
    if (!operation) {
      const methods = apiOperations
        .filter((operation) => matches(operation.path, url.pathname))
        .map((operation) => operation.method);
      const result = apiFailure(
        new HttpError(
          methods.length ? 405 : 404,
          methods.length
            ? "This method is not supported."
            : "This API endpoint was not found.",
        ),
      );
      if (methods.length) result.headers.set("Allow", methods.join(", "));
      return result;
    }
    validatePath(operation, url.pathname);
    validateQuery(operation, url.searchParams);
    const result = request.headers.has("authorization")
      ? await withAgent(
          request,
          (principal) => {
            if (operation.access !== "content")
              throw new HttpError(
                403,
                "This operation requires the owner browser session.",
              );
            return handleWorkspace(request, context, principal);
          },
          { apiKeyOnly: true },
        )
      : await handleWorkspace(request, context);
    return await validateApiResponse(request, result);
  } catch (error) {
    return apiFailure(error);
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as DELETE,
  handle as PUT,
};
