import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: (process.env.CILO_DEV_ORIGINS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  output: "standalone",
  agentRules: false,
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/*": [
      "./migrations/**/*",
      "./node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./tests/**/*", "./.impeccable/**/*", "./.git/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};
export default config;
