import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

await mkdir("public/reader", { recursive: true });
await build({
  entryPoints: { main: "scripts/public-reader.tsx" },
  outdir: "public/reader",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  chunkNames: "chunks/[name]-[hash]",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
await build({
  entryPoints: ["scripts/publication-renderer.tsx"],
  outfile: "generated/publication-renderer.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  minify: true,
  external: ["mermaid", "dompurify", "@shikijs/*"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const source = path.resolve("src/app/globals.css");
const result = await postcss([tailwind({ optimize: true })]).process(
  await readFile(source, "utf8"),
  { from: source, to: path.resolve("public/reader/reader.css") },
);
await writeFile(
  "public/reader/reader.css",
  result.css +
    '\n@font-face{font-family:"Geist Variable";font-style:normal;font-weight:100 900;font-display:swap;src:url("/reader/geist-latin-wght-normal.woff2") format("woff2")}',
);
await copyFile(
  "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  "public/reader/geist-latin-wght-normal.woff2",
);
