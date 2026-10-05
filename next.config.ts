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
        source: "/share/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'none'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' https: http:; media-src 'self' https: http:; font-src 'self'; connect-src 'self'${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
          },
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
