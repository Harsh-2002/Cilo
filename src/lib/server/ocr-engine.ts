import path from "node:path";
import type { Worker } from "tesseract.js";
import { maxTextLength } from "./extract";

// Language data ships with the app and is read from disk, so no image or text ever leaves this server.
const languageDirectory = () =>
  path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "@tesseract.js-data",
    "eng",
    "4.0.0_best_int",
  );
const timeoutMs = 90_000;
const idleMs = 30_000;
const state = globalThis as unknown as {
  nivraOcr?: {
    worker?: Promise<Worker>;
    idle?: ReturnType<typeof setTimeout>;
  };
};
const ocr = (state.nivraOcr ||= {});
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
export const shutdownEngine = stop;
