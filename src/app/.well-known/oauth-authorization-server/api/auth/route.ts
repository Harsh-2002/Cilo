import { installationExists } from "@/lib/server/installation";
import { auth } from "@/lib/server/auth";
import { response } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!installationExists())
    return response({ error: "Complete installation setup first." }, 409);
  if (typeof auth(request).api.getOAuthServerConfig !== "function")
    return response(
      {
        error:
          "OAuth requires HTTPS or a loopback origin. Configure NIVRA_PUBLIC_URL for remote access.",
      },
      400,
    );
  return response(await auth(request).api.getOAuthServerConfig());
}
