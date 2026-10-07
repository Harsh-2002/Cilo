import { passkey } from "@better-auth/passkey";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { environment } from "./environment";

export const passkeyFreshSeconds = 300;
export function requireVerifiedPasskey(userVerified: boolean | undefined) {
  if (userVerified !== true)
    throw new APIError("UNAUTHORIZED", {
      message: "Verify your passkey with a PIN or biometrics to sign in.",
      code: "PASSKEY_USER_VERIFICATION_REQUIRED",
    });
}
export function passkeyPlugin() {
  const origin = new URL(
    environment().NIVRA_PUBLIC_URL || "http://localhost:3000",
  );
  return passkey({
    rpName: "Nivra",
    rpID: origin.hostname,
    origin: origin.origin,
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    registration: {
      requireSession: true,
      afterVerification: ({ verification }) => {
        requireVerifiedPasskey(verification.registrationInfo?.userVerified);
      },
    },
    authentication: {
      afterVerification: ({ verification }) => {
        requireVerifiedPasskey(verification.authenticationInfo.userVerified);
      },
    },
  });
}
export const passkeyGuard = createAuthMiddleware(async (ctx) => {
  if (!ctx.path?.startsWith("/passkey/")) return;
  const origin = new URL(
    environment().NIVRA_PUBLIC_URL || "http://localhost:3000",
  );
  if (
    origin.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  )
    throw new APIError("BAD_REQUEST", {
      message: "Passkeys require HTTPS or localhost.",
    });
  if (
    ![
      "/passkey/generate-register-options",
      "/passkey/verify-registration",
      "/passkey/update-passkey",
      "/passkey/delete-passkey",
    ].includes(ctx.path)
  )
    return;
  const session = await getSessionFromCtx(ctx);
  if (!session)
    throw new APIError("UNAUTHORIZED", {
      message: "Sign in to manage your passkeys.",
    });
  if (
    Date.now() - new Date(session.session.createdAt).getTime() >=
    passkeyFreshSeconds * 1000
  )
    throw new APIError("FORBIDDEN", {
      message: "Sign in again before managing passkeys.",
      code: "PASSKEY_REAUTH_REQUIRED",
    });
  const name = ctx.body?.name;
  if (
    typeof name === "string" &&
    (name.trim().length < 1 || name.trim().length > 80)
  )
    throw new APIError("BAD_REQUEST", {
      message: "Use a passkey name between 1 and 80 characters.",
    });
});

export const passkeyOptions = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/passkey/generate-authenticate-options") return;
  const options = ctx.context.returned;
  if (options && typeof options === "object" && "challenge" in options)
    return ctx.json({ ...options, userVerification: "required" });
});
