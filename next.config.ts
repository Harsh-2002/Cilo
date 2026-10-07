import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { historicalNamespace } from "./src/lib/compatibility";
import { environment } from "./src/lib/server/environment";
import type { NextConfig } from "next";
const offlineStyle = readFileSync("public/offline.html", "utf8").match(
  /<style>([\s\S]*?)<\/style>/,
)![1];
const offlineStyleHash = createHash("sha256")
  .update(offlineStyle)
  .digest("base64");
const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  experimental: {
    webpackMemoryOptimizations: true,
    turbopackMemoryEviction: "auto",
  },
  allowedDevOrigins: (environment().NIVRA_DEV_ORIGINS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  async rewrites() {
    return [
      {
        source: `/api/${historicalNamespace}/:path*`,
        destination: "/api/nivra/:path*",
      },
    ];
  },
  output: "standalone",
  agentRules: false,
  serverExternalPackages: [
    "better-sqlite3",
    "tesseract.js",
    "unpdf",
    "sharp",
    "@napi-rs/canvas",
  ],
  outputFileTracingIncludes: {
    "/*": [
      "./migrations/**/*",
      "./generated/processing-worker.cjs",
      "./generated/thumbnail-worker.cjs",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-*/**/*",
      "./generated/publication-renderer.cjs",
      "./node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      // The OCR engine starts worker threads from its own files and reads local language data.
      "./node_modules/unpdf/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*",
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs}/**/*",
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
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), public-key-credentials-get=(self), public-key-credentials-create=(self), clipboard-read=(self), clipboard-write=(self)",
          },
          ...(environment()
            .NIVRA_PUBLIC_URL?.toLowerCase()
            .startsWith("https://")
            ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }]
            : []),
        ],
      },
      {
        source: "/share/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'none'; script-src 'none'; style-src 'sha256-${offlineStyleHash}'; style-src-attr 'none'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`,
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
