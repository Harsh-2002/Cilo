import { historicalNamespace } from "./src/lib/compatibility";
import { environment } from "./src/lib/server/environment";
import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  experimental: {
    webpackMemoryOptimizations: true,
    turbopackMemoryEviction: "full",
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
  serverExternalPackages: ["better-sqlite3", "tesseract.js", "unpdf", "sharp"],
  outputFileTracingIncludes: {
    "/*": [
      "./migrations/**/*",
      "./generated/processing-worker.cjs",
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
