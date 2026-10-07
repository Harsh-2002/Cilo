import { Worker } from "node:worker_threads";
import path from "node:path";
import { HttpError } from "./http";
import { documentInput } from "./validation";
let worker: Worker | undefined;
let tail: Promise<unknown> = Promise.resolve();
let queued = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
export async function markdownDocument(markdown: string) {
  if (++queued > 16) {
    --queued;
    throw new HttpError(429, "Markdown processing is busy. Try again shortly.");
  }
  const run = async () => {
    clearTimeout(idle);
    const current = (worker ||= new Worker(
      path.resolve("generated/agent-markdown-worker.mjs"),
      { execArgv: [] },
    ));
    current.ref();
    return new Promise<ReturnType<typeof documentInput.parse>>(
      (resolve, reject) => {
        const finish = (error?: Error, blocks?: Record<string, unknown>[]) => {
          clearTimeout(deadline);
          current.off("message", message);
          current.off("error", failure);
          current.off("exit", exit);
          current.unref();
          if (error) {
            worker = undefined;
            void current.terminate();
            reject(error);
          } else {
            try {
              resolve(documentInput.parse({ schemaVersion: 1, blocks }));
            } catch (e) {
              reject(e);
            }
          }
          idle = setTimeout(() => {
            worker = undefined;
            void current.terminate();
          }, 30000);
          idle.unref();
        };
        const message = (result: {
          blocks?: Record<string, unknown>[];
          error?: string;
        }) =>
          finish(
            result.error ? new HttpError(400, result.error) : undefined,
            result.blocks,
          );
        const failure = (e: Error) => finish(e);
        const exit = () =>
          finish(new HttpError(503, "Markdown processing stopped. Try again."));
        const deadline = setTimeout(
          () => finish(new HttpError(503, "Markdown processing timed out.")),
          30000,
        );
        current.once("message", message);
        current.once("error", failure);
        current.once("exit", exit);
        current.postMessage({ markdown });
      },
    );
  };
  const result = tail.then(run, run);
  tail = result.catch(() => {});
  try {
    return await result;
  } finally {
    --queued;
  }
}
