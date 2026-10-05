import path from "node:path";
import type { Worker } from "tesseract.js";
import { sqlite } from "./db";
import { storage } from "./storage";
import { imageInfo, maxTextLength, pdfText } from "./extract";

// Language data ships with the app and is read from disk, so no image or text ever leaves this server.
const languageDirectory = () =>
  path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "@tesseract.js-data",
    "eng",
    "4.0.0_best_int",
  );
const maxPixels = 60_000_000;
const timeoutMs = 90_000;
const idleMs = 30_000;
const state = globalThis as unknown as {
  nivraOcr?: {
    worker?: Promise<Worker>;
    idle?: ReturnType<typeof setTimeout>;
    queue: Promise<void>;
    queued: Set<string>;
    resumed: boolean;
  };
};
const ocr = (state.nivraOcr ||= {
  queue: Promise.resolve(),
  queued: new Set(),
  resumed: false,
});
async function stop() {
  clearTimeout(ocr.idle);
  const worker = ocr.worker;
  ocr.worker = undefined;
  await (await worker?.catch(() => undefined))?.terminate().catch(() => {});
}
async function engine() {
  ocr.worker ||= import("tesseract.js").then(({ createWorker }) =>
    createWorker("eng", 1, {
      langPath: languageDirectory(),
      cacheMethod: "none",
      gzip: true,
      errorHandler: () => {},
    }),
  );
  return ocr.worker;
}
export async function recognize(bytes: Uint8Array, limit = timeoutMs) {
  clearTimeout(ocr.idle);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const worker = await engine();
    const result = await Promise.race([
      worker.recognize(Buffer.from(bytes)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Text recognition timed out.")),
          limit,
        );
      }),
    ]);
    return result.data.text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxTextLength);
  } catch (error) {
    await stop();
    throw error;
  } finally {
    clearTimeout(timer);
    ocr.idle = setTimeout(() => void stop(), idleMs);
    ocr.idle.unref?.();
  }
}
type Pending = { id: string; storage_key: string | null; mime: string };
async function readArtifact(id: string) {
  const database = sqlite();
  const row = database
    .prepare(
      "SELECT id,storage_key,mime FROM artifacts WHERE id=? AND extraction='pending'",
    )
    .get(id) as Pending | undefined;
  if (!row) return;
  const finish = (text: string | null) =>
    database
      .prepare(
        "UPDATE artifacts SET content=?,extraction=?,updated_at=? WHERE id=? AND extraction='pending'",
      )
      .run(text ?? "", text === null ? "failed" : "done", Date.now(), id);
  try {
    if (!row.storage_key) return void finish(null);
    const bytes = await storage.read(row.storage_key);
    if (row.mime === "application/pdf")
      return void finish(await pdfText(bytes));
    const info = imageInfo(bytes);
    if (!info || info.width * info.height > maxPixels) return void finish(null);
    finish(await recognize(bytes));
  } catch {
    finish(null);
  }
}
export function enqueueOcr(id: string) {
  if (ocr.queued.has(id)) return;
  ocr.queued.add(id);
  ocr.queue = ocr.queue
    .then(() => readArtifact(id))
    .finally(() => ocr.queued.delete(id));
}
// Unfinished recognition is picked up again after a restart.
export function resumeOcr() {
  if (ocr.resumed) return;
  ocr.resumed = true;
  const rows = sqlite()
    .prepare(
      "SELECT id FROM artifacts WHERE extraction='pending' ORDER BY created_at",
    )
    .all() as { id: string }[];
  for (const { id } of rows) enqueueOcr(id);
}
export function ocrIdle() {
  return ocr.queue;
}
export async function shutdownOcr() {
  await stop();
}
