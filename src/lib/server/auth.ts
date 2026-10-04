import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username, twoFactor } from "better-auth/plugins";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db, dataDir } from "./db";
import * as schema from "./schema";
import { requestOrigin } from "./http";

function secret() {
  db();
  const file = path.join(dataDir, "auth.secret");
  try {
    return readFileSync(file, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      writeFileSync(file, randomBytes(48).toString("base64url"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return readFileSync(file, "utf8").trim();
  }
}
export function auth(request?: Request) {
  const origin = request
    ? requestOrigin(request)
    : process.env.CILO_PUBLIC_URL || "http://localhost:3000";
  return betterAuth({
    appName: "Cilo",
    baseURL: origin,
    secret: secret(),
    database: drizzleAdapter(db(), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    plugins: [username(), twoFactor({ issuer: "Cilo" })],
    trustedOrigins: [origin],
    rateLimit: { enabled: true, window: 60, max: 30 },
    session: { expiresIn: 60 * 60 * 24 * 14 },
  });
}
