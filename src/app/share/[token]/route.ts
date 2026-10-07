import { cachedPublicationHtml } from "@/lib/server/publication-html";
import { randomBytes } from "node:crypto";
import { publicPagePolicy } from "@/lib/security-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const html = cachedPublicationHtml((await params).token);
  const nonce = randomBytes(18).toString("base64");
  const body = html
    ?.replaceAll('nonce="__NIVRA_CSP_NONCE__"', `nonce="${nonce}"`)
    .replaceAll('content="__NIVRA_CSP_NONCE__"', `content="${nonce}"`);
  return new Response(body || "This shared note is unavailable.", {
    status: html ? 200 : 404,
    headers: {
      "Content-Type": html
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": publicPagePolicy(nonce),
    },
  });
}
