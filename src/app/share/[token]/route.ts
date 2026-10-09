import { publicationPage } from "@/lib/server/publication-html";
import { publicErrorHtml } from "@/lib/server/public-error";
import { randomBytes } from "node:crypto";
import { publicPagePolicy } from "@/lib/security-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  let page: ReturnType<typeof publicationPage>;
  try {
    page = publicationPage((await params).token);
  } catch {
    page = { status: 503, html: null };
  }
  const { html, status } = page;
  const nonce = randomBytes(18).toString("base64");
  const body = html
    ?.replaceAll('nonce="__NIVRA_CSP_NONCE__"', `nonce="${nonce}"`)
    .replaceAll('content="__NIVRA_CSP_NONCE__"', `content="${nonce}"`);
  return new Response(body || publicErrorHtml(status === 404 ? 404 : 503), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...(status === 503 ? { "Retry-After": "60" } : {}),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": publicPagePolicy(nonce),
    },
  });
}
