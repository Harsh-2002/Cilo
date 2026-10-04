import { auth } from "@/lib/server/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  return auth(request).handler(request);
}
export { handle as GET, handle as POST };
