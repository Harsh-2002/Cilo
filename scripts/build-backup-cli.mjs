import { build } from "esbuild";
await build({
  entryPoints: ["scripts/backup-cli.ts"],
  outfile: ".next/standalone/backup-cli.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["better-sqlite3"],
  minify: true,
  logLevel: "warning",
});
