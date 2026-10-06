import path from "node:path";
import { Worker } from "node:worker_threads";
import { sqlite } from "./db";
import { storage } from "./storage";
import type { JobContext } from "./jobs";
export async function processArtifact({ job, commit }: JobContext) {
  const row = sqlite()
    .prepare(
      "SELECT storage_key,name,mime FROM artifacts WHERE id=? AND owner_id=? AND extraction='pending'",
    )
    .get(job.target_id, job.owner_id) as
    { storage_key: string; name: string; mime: string } | undefined;
  if (!row) {
    commit(() => "cancelled");
    return;
  }
  const bytes = await storage.read(row.storage_key);
  const result = await new Promise<{ text: string; status: string }>(
    (resolve, reject) => {
      const worker = new Worker(
        path.join(
          /* turbopackIgnore: true */ process.cwd(),
          "generated/processing-worker.cjs",
        ),
        {
          workerData: { bytes, name: row.name, mime: row.mime },
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        },
      );
      let settled = false;
      const finish = async (
        result?: { text: string; status: string },
        error?: Error,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        await worker.terminate();
        if (error) reject(error);
        else resolve(result!);
      };
      const timer = setTimeout(() => {
        void finish(undefined, new Error("Extraction timed out."));
      }, 100_000);
      worker.once("message", (result) => {
        void finish(
          result.error ? undefined : result,
          result.error ? new Error("Extraction failed.") : undefined,
        );
      });
      worker.once("error", (error) => {
        void finish(undefined, error);
      });
      worker.once("exit", () => {
        void finish(undefined, new Error("Extraction worker stopped."));
      });
    },
  );
  commit(() => {
    sqlite()
      .prepare(
        "UPDATE artifacts SET content=?,extraction=?,updated_at=? WHERE id=? AND owner_id=? AND extraction='pending'",
      )
      .run(result.text, result.status, Date.now(), job.target_id, job.owner_id);
    return result.status;
  });
}
