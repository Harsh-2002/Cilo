import { Worker } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { sqlite } from "./db";
import type { Document } from "../types";
import { publicationMedia } from "../media-url";

type Snapshot = { title: string; document: Document; publishedAt: number };
const renderer = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "generated/publication-renderer.cjs",
);
let version: string | undefined;
export function publicationRendererVersion() {
  return (version ||= createHash("sha256")
    .update(readFileSync(renderer))
    .digest("hex"));
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function renderPublicationHtml(
  snapshot: Snapshot,
  excerpt: string,
  token?: string,
) {
  if (token)
    snapshot = {
      ...snapshot,
      document: publicationMedia(snapshot.document, token),
    };
  const markup = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(renderer, {
      workerData: snapshot,
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Published page preparation timed out."));
    }, 15000);
    worker.once("message", (value) => {
      clearTimeout(timer);
      void worker.terminate();
      if (typeof value === "string") resolve(value);
      else reject(new Error("Published page preparation failed."));
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Published page preparation failed."));
    });
    worker.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Published page preparation failed."));
    });
  });
  const title = escape(snapshot.title || "Untitled");
  const description = escape(excerpt);
  const data = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="noindex,nofollow"><meta name="nivra-nonce" content="__NIVRA_CSP_NONCE__"><meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><link rel="icon" href="/icon.svg?v=5"><link rel="stylesheet" href="/reader/reader.css"><script type="module" nonce="__NIVRA_CSP_NONCE__" src="/reader/main.js"></script></head><body><div id="publication-root">${markup}</div><script id="publication-data" type="application/json">${data}</script></body></html>`;
}
export function cachedPublicationHtml(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return (
    (
      sqlite()
        .prepare(
          "SELECT p.html FROM publication_pages p JOIN publications n ON n.token=p.token WHERE p.token=? AND p.renderer_version=?",
        )
        .get(token, publicationRendererVersion()) as
        { html: string } | undefined
    )?.html || null
  );
}
export async function preparePublicationPages() {
  const d = sqlite();
  const rendererVersion = publicationRendererVersion();
  const rows = d
    .prepare(
      "SELECT p.token,p.title,p.document,p.excerpt,p.published_at AS publishedAt,p.revision FROM publications p LEFT JOIN publication_pages h ON h.token=p.token WHERE h.renderer_version IS NULL OR h.renderer_version!=?",
    )
    .all(rendererVersion) as {
    token: string;
    title: string;
    document: string;
    excerpt: string;
    publishedAt: number;
    revision: number;
  }[];
  for (const row of rows) {
    const html = await renderPublicationHtml(
      {
        title: row.title,
        document: JSON.parse(row.document),
        publishedAt: row.publishedAt,
      },
      row.excerpt,
      row.token,
    );
    d.prepare(
      "INSERT INTO publication_pages(token,html,renderer_version) SELECT token,?,? FROM publications WHERE token=? AND revision=? AND published_at=? ON CONFLICT(token) DO UPDATE SET html=excluded.html,renderer_version=excluded.renderer_version",
    ).run(html, rendererVersion, row.token, row.revision, row.publishedAt);
  }
}
