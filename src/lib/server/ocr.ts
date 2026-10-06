import { sqlite } from "./db";
import { enqueueJob, startJobWorker } from "./jobs";
import { shutdownEngine } from "./ocr-engine";
export { recognize } from "./ocr-engine";
export async function ocrIdle() {
  return (await import("./jobs")).jobsIdle();
}
export async function shutdownOcr() {
  await (await import("./jobs")).stopJobWorker();
  await shutdownEngine();
}
export function resumeOcr() {
  const rows = sqlite()
    .prepare("SELECT id,owner_id FROM artifacts WHERE extraction='pending'")
    .all() as { id: string; owner_id: string }[];
  for (const row of rows) enqueueJob(row.owner_id, "artifact", row.id);
  startJobWorker();
}
