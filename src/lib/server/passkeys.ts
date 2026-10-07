import { passkey } from "@better-auth/passkey";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { sqlite } from "./db";
import { passkeySetupIntent, createPasskeyOwner } from "./passkey-setup";
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
      requireSession: false,
      resolveUser: ({ context }) => {
        if (sqlite().prepare("SELECT 1 FROM user").get())
          throw new APIError("UNAUTHORIZED", {
            message: "Sign in to add a passkey.",
          });
        const row = passkeySetupIntent(context);
        return { id: row.user_id, name: row.username, displayName: row.name };
      },
      afterVerification: async ({ verification, ctx, context, user }) => {
        requireVerifiedPasskey(verification.registrationInfo?.userVerified);
        const session = await getSessionFromCtx(ctx);
        if (!session) createPasskeyOwner(context, user.id);
      },
    },
    authentication: {
      afterVerification: ({ verification }) => {
        requireVerifiedPasskey(verification.authenticationInfo.userVerified);
      },
    },
  });
}
export const authGuard = createAuthMiddleware(async (ctx) => {
  if (
    (ctx.path === "/update-user" &&
      ["name", "username", "displayUsername", "email"].some(
        (field) => ctx.body?.[field] !== undefined,
      )) ||
    ctx.path === "/change-email"
  )
    throw new APIError("FORBIDDEN", {
      message: "Your account name and login identifier are fixed after setup.",
      code: "ACCOUNT_IDENTITY_FIXED",
    });
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
  const name = ctx.body?.name;
  if (
    typeof name === "string" &&
    (name.trim().length < 1 || name.trim().length > 80)
  )
    throw new APIError("BAD_REQUEST", {
      message: "Use a passkey name between 1 and 80 characters.",
    });
  if (!session) {
    if (
      !sqlite().prepare("SELECT 1 FROM user").get() &&
      ctx.path === "/passkey/generate-register-options"
    ) {
      passkeySetupIntent(ctx.query?.context);
      return;
    }
    if (
      !sqlite().prepare("SELECT 1 FROM user").get() &&
      ctx.path === "/passkey/verify-registration" &&
      ctx.body?.createSession === true
    )
      return;
    throw new APIError("UNAUTHORIZED", {
      message: "Sign in to manage your passkeys.",
    });
  }
  if (
    ctx.path === "/passkey/delete-passkey" &&
    !sqlite()
      .prepare(
        "SELECT 1 FROM account WHERE user_id=? AND provider_id='credential' AND password IS NOT NULL",
      )
      .get(session.user.id) &&
    (
      sqlite()
        .prepare("SELECT count(*) n FROM passkey WHERE user_id=?")
        .get(session.user.id) as { n: number }
    ).n <= 1
  )
    throw new APIError("BAD_REQUEST", {
      message:
        "Add a password or another passkey before removing your last passkey.",
    });
  if (
    Date.now() - new Date(session.session.createdAt).getTime() >=
    passkeyFreshSeconds * 1000
  )
    throw new APIError("FORBIDDEN", {
      message: "Sign in again before managing passkeys.",
      code: "PASSKEY_REAUTH_REQUIRED",
    });
});

export const passkeyOptions = createAuthMiddleware(async (ctx) => {
  const options = ctx.context.returned;
  if (
    ctx.path === "/passkey/generate-register-options" &&
    options &&
    typeof options === "object" &&
    "user" in options &&
    options.user &&
    typeof options.user === "object"
  ) {
    const session = await getSessionFromCtx(ctx);
    const identity = session
      ? (sqlite()
          .prepare("SELECT name,username FROM user WHERE id=?")
          .get(session.user.id) as { name: string; username: string })
      : passkeySetupIntent(ctx.query?.context);
    return ctx.json({
      ...options,
      user: {
        ...options.user,
        name: identity.username,
        displayName: identity.name,
      },
    });
  }
  if (ctx.path !== "/passkey/generate-authenticate-options") return;
  if (options && typeof options === "object" && "challenge" in options)
    return ctx.json({ ...options, userVerification: "required" });
});
