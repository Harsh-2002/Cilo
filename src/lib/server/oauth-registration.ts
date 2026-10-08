import { z } from "zod";
import { sqlite } from "./db";
import { HttpError, readLimited, throttle } from "./http";

const registration = z
  .object({
    client_name: z.string().trim().max(200).optional(),
    redirect_uris: z.array(z.string().min(1).max(2048)).min(1).max(10),
    application_type: z.enum(["web", "native"]).optional(),
  })
  .passthrough();

export async function prepareOAuthRegistration(request: Request) {
  const bytes = await readLimited(request, 16384);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Client registration requires valid JSON.");
  }
  const result = registration.safeParse(parsed);
  if (!result.success)
    throw new HttpError(400, "Invalid client registration metadata.");
  const body = result.data;
  if (body.require_pkce === false || body.skip_consent === true)
    throw new HttpError(
      400,
      "OAuth clients cannot disable PKCE or owner consent.",
    );
  if (
    !body.application_type &&
    body.redirect_uris.some((uri) => {
      try {
        const url = new URL(uri);
        return (
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        );
      } catch {
        return false;
      }
    })
  )
    body.application_type = "native";
  throttle("oauth-client-registration");
  const pending = sqlite()
    .prepare(
      "SELECT count(*) AS n FROM oauth_client c WHERE user_id IS NULL AND client_discovery_id IS NULL AND NOT EXISTS(SELECT 1 FROM oauth_consent s WHERE s.client_id=c.client_id)",
    )
    .get() as { n: number };
  if (pending.n >= 200)
    throw new HttpError(429, "Too many unapproved OAuth clients.");
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
