import { randomUUID } from "node:crypto";
import { sqlite } from "./db";

export type JobKind = "artifact" | "bookmark" | "thumbnail";
export type Job = {
  id: string;
  owner_id: string;
  kind: JobKind;
  target_id: string;
  attempts: number;
  lease_token: string;
};
export type JobContext = { job: Job; commit: (write: () => string) => boolean };
export const maxAttempts = 3;
const leaseMs = 120_000;
const state = globalThis as unknown as {
  nivraJobs?: {
    timer?: ReturnType<typeof setInterval>;
    active: Set<Promise<void>>;
    activeKinds?: Map<Promise<void>, JobKind>;
    stopped: boolean;
  };
};
const runner = (state.nivraJobs ||= { active: new Set(), stopped: false });
const activeKinds = (runner.activeKinds ||= new Map());

export function enqueueJob(owner: string, kind: JobKind, target: string) {
  const now = Date.now();
  sqlite()
    .prepare(
      `INSERT INTO background_jobs(id,owner_id,kind,target_id,available_at,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(kind,target_id) DO UPDATE SET state='queued',attempts=0,available_at=excluded.available_at,lease_token=NULL,lease_until=NULL
    WHERE background_jobs.state IN ('done','failed')`,
    )
    .run(randomUUID(), owner, kind, target, now, now);
}
export function completionEvent(
  owner: string,
  kind: Exclude<JobKind, "thumbnail"> | "backup" | "content",
  target: string,
  status: string,
) {
  sqlite()
    .prepare(
      "INSERT INTO completion_events(owner_id,kind,target_id,status,created_at) VALUES(?,?,?,?,?)",
    )
    .run(owner, kind, target, status, Date.now());
  sqlite()
    .prepare(
      "DELETE FROM completion_events WHERE id <= (SELECT coalesce(max(id),0)-1000 FROM completion_events)",
    )
    .run();
}
export function claimJob(
  now = Date.now(),
  preferredKind?: JobKind,
): Job | undefined {
  return sqlite()
    .transaction(() => {
      const row = sqlite()
        .prepare(
          "SELECT * FROM background_jobs WHERE (state='queued' AND available_at<=?) OR (state='running' AND lease_until<=?) ORDER BY CASE WHEN kind='thumbnail' THEN 0 WHEN kind=? THEN 1 ELSE 2 END,available_at,created_at LIMIT 1",
        )
        .get(now, now, preferredKind ?? null) as Job | undefined;
      if (!row) return;
      const token = randomUUID();
      sqlite()
        .prepare(
          "UPDATE background_jobs SET state='running',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?",
        )
        .run(token, now + leaseMs, row.id);
      return { ...row, attempts: row.attempts + 1, lease_token: token };
    })
    .immediate();
}
export function commitJob(job: Job, write: () => string) {
  return sqlite()
    .transaction(() => {
      if (
        !sqlite()
          .prepare(
            "SELECT 1 FROM background_jobs WHERE id=? AND state='running' AND lease_token=? AND lease_until>?",
          )
          .get(job.id, job.lease_token, Date.now())
      )
        return false;
      const status = write();
      sqlite()
        .prepare(
          "UPDATE background_jobs SET state=?,lease_token=NULL,lease_until=NULL WHERE id=?",
        )
        .run(
          status === "failed" || status === "unavailable" ? "failed" : "done",
          job.id,
        );
      const formFile =
        job.kind === "thumbnail"
          ? (sqlite()
              .prepare(
                "SELECT ff.form_id AS formId FROM form_files ff JOIN forms f ON f.id=ff.form_id WHERE ff.id=? AND f.owner_id=?",
              )
              .get(job.target_id, job.owner_id) as
              { formId: string } | undefined)
          : undefined;
      completionEvent(
        job.owner_id,
        formFile ? "content" : job.kind === "thumbnail" ? "artifact" : job.kind,
        formFile ? formFile.formId : job.target_id,
        formFile ? "forms" : status,
      );
      return true;
    })
    .immediate();
}
async function execute(job: Job) {
  const heartbeat = setInterval(() => {
    sqlite()
      .prepare(
        "UPDATE background_jobs SET lease_until=? WHERE id=? AND state='running' AND lease_token=? AND lease_until>?",
      )
      .run(Date.now() + leaseMs, job.id, job.lease_token, Date.now());
  }, 30_000);
  heartbeat.unref();
  try {
    if (job.attempts > maxAttempts) throw new Error("Job retry limit reached.");
    const context = {
      job,
      commit: (write: () => string) => commitJob(job, write),
    };
    await (
      await import("./storage-operations")
    ).storageOperation(async () => {
      if (job.kind === "artifact")
        await (await import("./artifact-processing")).processArtifact(context);
      else if (job.kind === "thumbnail")
        await (await import("./artifact-thumbnails")).processThumbnail(context);
      else await (await import("./bookmarks")).processBookmark(context);
    });
  } catch {
    if (job.attempts >= maxAttempts) {
      commitJob(job, () => {
        if (job.kind === "artifact")
          sqlite()
            .prepare(
              "UPDATE artifacts SET extraction='failed',updated_at=? WHERE id=? AND owner_id=? AND extraction='pending' AND trashed_at IS NULL",
            )
            .run(Date.now(), job.target_id, job.owner_id);
        else if (job.kind === "thumbnail")
          sqlite()
            .prepare(
              "UPDATE artifacts SET thumbnail_status='failed',updated_at=? WHERE id=? AND owner_id=? AND thumbnail_status='pending' AND trashed_at IS NULL",
            )
            .run(Date.now(), job.target_id, job.owner_id);
        else
          sqlite()
            .prepare(
              "UPDATE bookmarks SET metadata_status='unavailable',updated_at=? WHERE id=? AND owner_id=? AND metadata_status='pending' AND trashed_at IS NULL",
            )
            .run(Date.now(), job.target_id, job.owner_id);
        if (job.kind === "thumbnail")
          sqlite()
            .prepare(
              "UPDATE form_files SET thumbnail_status='failed' WHERE id=? AND thumbnail_status='pending' AND EXISTS(SELECT 1 FROM forms WHERE id=form_files.form_id AND owner_id=?)",
            )
            .run(job.target_id, job.owner_id);
        return "failed";
      });
    } else
      sqlite()
        .prepare(
          "UPDATE background_jobs SET state='queued',available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        )
        .run(Date.now() + job.attempts * 1000, job.id, job.lease_token);
  } finally {
    clearInterval(heartbeat);
  }
}
export function wakeJobs() {
  if (runner.stopped) return;
  while (runner.active.size < 2) {
    const preferred = [...activeKinds.values()].includes("bookmark")
      ? "artifact"
      : "bookmark";
    const job = claimJob(Date.now(), preferred);
    if (!job) break;
    const work = execute(job).finally(() => {
      runner.active.delete(work);
      activeKinds.delete(work);
    });
    runner.active.add(work);
    activeKinds.set(work, job.kind);
  }
}
export function startJobWorker() {
  runner.stopped = false;
  runner.timer ||= setInterval(wakeJobs, 1000);
  runner.timer.unref();
}
export async function jobsIdle() {
  startJobWorker();
  while (
    runner.active.size ||
    sqlite()
      .prepare(
        "SELECT 1 FROM background_jobs WHERE state IN ('queued','running') LIMIT 1",
      )
      .get()
  ) {
    wakeJobs();
    if (runner.active.size) await Promise.all([...runner.active]);
    else await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
export async function stopJobWorker() {
  runner.stopped = true;
  clearInterval(runner.timer);
  runner.timer = undefined;
  await Promise.all([...runner.active]);
}
