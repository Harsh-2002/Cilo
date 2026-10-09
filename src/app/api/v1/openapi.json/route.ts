import { openApiDocument } from "@/lib/server/api-contract";
export const runtime = "nodejs";
export function GET() {
  return Response.json(openApiDocument(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
