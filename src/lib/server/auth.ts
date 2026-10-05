import { environment } from "./environment";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username, twoFactor } from "better-auth/plugins";
import { randomBytes } from "node:crypto";
import { runtimeFs } from "./runtime-fs";
const { readFileSync, writeFileSync } = runtimeFs;
import path from "node:path";
import { db, dataDir } from "./db";
import * as schema from "./schema";
import { requestOrigin } from "./http";
import {
  isEncrypted,
  masterKey,
  replaceFile,
  seal,
  unseal,
  syncDirectory,
} from "./encryption";

export function authSecret() {
  db();
  const file = path.join(/* turbopackIgnore: true */ dataDir, "auth.secret");
  const key = masterKey(dataDir);
  try {
    const bytes = readFileSync(file);
    if (isEncrypted(bytes))
      return unseal(bytes, key, "auth-secret").toString("utf8").trim();
    replaceFile(file, seal(bytes, key, "auth-secret"));
    return bytes.toString("utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      writeFileSync(
        file,
        seal(
          Buffer.from(randomBytes(48).toString("base64url")),
          key,
          "auth-secret",
        ),
        {
          flag: "wx",
          mode: 0o600,
          flush: true,
        },
      );
      syncDirectory(dataDir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return unseal(readFileSync(file), key, "auth-secret")
      .toString("utf8")
      .trim();
  }
}
export function auth(request?: Request) {
  const origin = request
    ? requestOrigin(request)
    : environment().NIVRA_PUBLIC_URL || "http://localhost:3000";
  return betterAuth({
    appName: "Nivra",
    baseURL: origin,
    secret: authSecret(),
    database: drizzleAdapter(db(), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    plugins: [username(), twoFactor({ issuer: "Nivra" })],
    trustedOrigins: [origin],
    rateLimit: { enabled: true, window: 60, max: 30 },
    session: { expiresIn: 60 * 60 * 24 * 14 },
  });
}
