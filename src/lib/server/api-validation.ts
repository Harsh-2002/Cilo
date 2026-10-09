import { z } from "zod";
import { operationFor, type ApiOperation } from "./api-contract";
import { apiOutputs, idSchema } from "./api-schemas";
import { HttpError, response } from "./http";
export function errorCode(status: number) {
  return (
    (
      {
        400: "invalid_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        413: "payload_too_large",
        415: "unsupported_media_type",
        422: "unprocessable_entity",
        429: "rate_limited",
        503: "unavailable",
      } as Record<number, string>
    )[status] ?? "internal_error"
  );
}
export function validatePath(operation: ApiOperation, pathname: string) {
  const template = operation.path.split("/");
  const actual = pathname.split("/");
  for (let index = 0; index < template.length; index++) {
    if (!["{id}", "{versionId}"].includes(template[index])) continue;
    if (operation.path.startsWith("/api/v1/backups/"))
      z.string().min(1).max(300).parse(actual[index]);
    else if (operation.path.startsWith("/api/v1/calendar/reminders/"))
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(actual[index]);
    else idSchema.parse(actual[index]);
  }
}
export function validateQuery(operation: ApiOperation, query: URLSearchParams) {
  for (const key of query.keys())
    if (query.getAll(key).length > 1)
      throw new HttpError(400, "Query parameters cannot be repeated.");
  if (operation.query) operation.query.parse(Object.fromEntries(query));
  else if (query.size && !operation.binary)
    throw new HttpError(
      400,
      "This operation does not accept query parameters.",
    );
}
export function validateBody(operation: ApiOperation, input: unknown) {
  if (operation.multipart && input instanceof FormData) return;
  if (operation.input)
    operation.input.parse(
      input === undefined && operation.optionalBody ? {} : input,
    );
}
export async function validateApiResponse(request: Request, result: Response) {
  const operation = operationFor(new URL(request.url).pathname, request.method);
  if (result.ok && operation?.binary) return result;
  if (!(result.headers.get("content-type") ?? "").includes("application/json"))
    return result;
  const body = await result.clone().json();
  if (!result.ok) {
    const error =
      typeof body.error === "string"
        ? body.error
        : body.message || "This request could not be completed.";
    const code =
      typeof body.code === "string" ? body.code : errorCode(result.status);
    const headers = new Headers(result.headers);
    if (result.status === 429 && !headers.has("Retry-After"))
      headers.set("Retry-After", "60");
    if (result.status === 503 && !headers.has("Retry-After"))
      headers.set("Retry-After", "5");
    if (request.headers.has("authorization"))
      headers.set("WWW-Authenticate", 'Bearer realm="Nivra API"');
    return new Response(
      JSON.stringify(apiOutputs.error.parse({ ...body, error, code })),
      { status: result.status, headers },
    );
  }
  if (
    operation &&
    (!operation.output.safeParse(body).success ||
      ![operation.status, ...(operation.additionalStatuses ?? [])].includes(
        result.status,
      ))
  ) {
    console.error(
      "Nivra API response contract failed:",
      operation.method,
      operation.path,
    );
    return response(
      {
        code: "internal_error",
        error: "This request returned an invalid response. Try again.",
      },
      500,
    );
  }
  return result;
}
export function apiFailure(error: unknown) {
  const status =
    error instanceof HttpError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 500;
  const message =
    error instanceof HttpError
      ? error.message
      : error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid request input.")
        : "Nivra could not complete this action. Try again.";
  return response({ code: errorCode(status), error: message }, status);
}
