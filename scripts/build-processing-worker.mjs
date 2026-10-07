import { build } from "esbuild";
await build({
  entryPoints: ["scripts/processing-worker.ts"],
  outfile: "generated/processing-worker.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["tesseract.js", "unpdf", "better-sqlite3", "sharp"],
  logLevel: "warning",
});

await build({
  entryPoints: ["scripts/thumbnail-worker.ts"],
  outfile: "generated/thumbnail-worker.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["sharp", "unpdf", "@napi-rs/canvas"],
  logLevel: "warning",
});
