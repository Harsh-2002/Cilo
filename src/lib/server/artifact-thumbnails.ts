import { Worker } from "node:worker_threads";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sqlite } from "./db";
import { storage } from "./storage";
import { enqueueJob, type JobContext } from "./jobs";

export function thumbnailSupported(mime: string) {
  return (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf" ||
    /^application\/vnd\.(openxmlformats-officedocument|oasis.opendocument)\./.test(
      mime,
    )
  );
}
export function resumeThumbnails() {
  const rows = sqlite()
    .prepare(
      "SELECT id,owner_id FROM artifacts WHERE thumbnail_status='pending' AND trashed_at IS NULL",
    )
    .all() as { id: string; owner_id: string }[];
  for (const row of rows) enqueueJob(row.owner_id, "thumbnail", row.id);
}
export async function processThumbnail({ job, commit }: JobContext) {
  const row = sqlite()
    .prepare(
      "SELECT storage_key,thumb_key,mime,size FROM artifacts WHERE id=? AND owner_id=? AND thumbnail_status='pending' AND trashed_at IS NULL",
    )
    .get(job.target_id, job.owner_id) as
    | {
        storage_key: string;
        thumb_key: string | null;
        mime: string;
        size: number;
      }
    | undefined;
  if (!row) {
    commit(() => "cancelled");
    return;
  }
  if (!row.mime.startsWith("video/") && row.size > 40 * 1024 * 1024) {
    commit(() => {
      sqlite()
        .prepare(
          "UPDATE artifacts SET thumbnail_status='none' WHERE id=? AND owner_id=? AND thumbnail_status='pending'",
        )
        .run(job.target_id, job.owner_id);
      return "none";
    });
    return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-preview-"));
  let created: string | undefined;
  let attached = false;
  try {
    const file = path.join(directory, "source");
    const handle = await open(file, "wx", 0o600);
    try {
      const source = await storage.open(row.storage_key);
      for (let offset = 0; offset < source.size; offset += 1024 * 1024)
        await handle.writeFile(
          await source.read(
            offset,
            Math.min(offset + 1024 * 1024, source.size) - 1,
          ),
        );
    } finally {
      await handle.close();
    }
    const result = await new Promise<{
      status: "done" | "none" | "failed";
      thumbnail?: Uint8Array;
    }>((resolve, reject) => {
      const worker = new Worker(
        path.join(
          /* turbopackIgnore: true */ process.cwd(),
          "generated/thumbnail-worker.cjs",
        ),
        {
          workerData: { file, mime: row.mime },
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 256 },
        },
      );
      let settled = false;
      const finish = async (
        value?: { status: "done" | "none" | "failed"; thumbnail?: Uint8Array },
        error?: Error,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        await worker.terminate();
        if (error) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(
        () =>
          void finish(undefined, new Error("Thumbnail generation timed out.")),
        25000,
      );
      worker.once("message", (value) => void finish(value));
      worker.once(
        "error",
        () => void finish(undefined, new Error("Thumbnail generation failed.")),
      );
      worker.once(
        "exit",
        () => void finish(undefined, new Error("Thumbnail worker stopped.")),
      );
    });
    if (result.status === "done" && result.thumbnail?.length) {
      created = randomUUID();
      await storage.write(created, result.thumbnail);
    }
    const status = created
      ? "done"
      : result.status === "done"
        ? "failed"
        : result.status;
    commit(() => {
      attached = !!sqlite()
        .prepare(
          "UPDATE artifacts SET thumb_key=coalesce(?,thumb_key),thumbnail_status=?,updated_at=? WHERE id=? AND owner_id=? AND storage_key=? AND thumbnail_status='pending' AND trashed_at IS NULL",
        )
        .run(
          created || null,
          status,
          Date.now(),
          job.target_id,
          job.owner_id,
          row.storage_key,
        ).changes;
      return attached ? status : "cancelled";
    });
    if (attached && created && row.thumb_key && row.thumb_key !== created)
      await storage.delete(row.thumb_key);
  } finally {
    if (created && !attached) await storage.delete(created);
    await rm(directory, { recursive: true, force: true });
  }
}
