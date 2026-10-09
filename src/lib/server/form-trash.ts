import { sqlite } from "./db";
import { HttpError } from "./http";
import { completionEvent, enqueueJob, startJobWorker } from "./jobs";
import { storage } from "./storage";

type FormTrashKind = "form" | "form_response";
function deletedItem(
  owner: string,
  kind: FormTrashKind,
  id: string,
  revision: number,
) {
  const row = sqlite()
    .prepare(
      kind === "form"
        ? "SELECT id AS formId,trashed_at AS parentTrash FROM forms WHERE id=? AND owner_id=? AND revision=? AND trashed_at IS NOT NULL"
        : "SELECT f.id AS formId,f.trashed_at AS parentTrash FROM form_responses r JOIN forms f ON f.id=r.form_id WHERE r.id=? AND f.owner_id=? AND r.revision=? AND r.trashed_at IS NOT NULL",
    )
    .get(id, owner, revision) as
    { formId: string; parentTrash: number | null } | undefined;
  if (!row)
    throw new HttpError(
      409,
      "This item changed or is no longer in Trash. Reload Trash and try again.",
    );
  return row;
}
export function restoreFormTrash(
  owner: string,
  kind: FormTrashKind,
  id: string,
  revision: number,
) {
  sqlite()
    .transaction(() => {
      const row = deletedItem(owner, kind, id, revision);
      if (kind === "form_response" && row.parentTrash !== null)
        throw new HttpError(409, "Restore the form before this submission.");
      if (kind === "form")
        sqlite()
          .prepare(
            "UPDATE forms SET trashed_at=NULL,status='draft',public_token=NULL,published_version_id=NULL,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?",
          )
          .run(Date.now(), id, owner, revision);
      else
        sqlite()
          .prepare(
            "UPDATE form_responses SET trashed_at=NULL,revision=revision+1 WHERE id=? AND form_id=? AND revision=?",
          )
          .run(id, row.formId, revision);
      const files = sqlite()
        .prepare(
          "SELECT ff.id FROM form_files ff JOIN form_responses r ON r.id=ff.response_id WHERE ff.form_id=? AND ff.state='attached' AND ff.thumbnail_status='pending' AND r.trashed_at IS NULL",
        )
        .all(row.formId) as { id: string }[];
      for (const file of files) enqueueJob(owner, "thumbnail", file.id);
      completionEvent(owner, "content", row.formId, "forms");
    })
    .immediate();
  startJobWorker();
}
export async function deleteFormTrash(
  owner: string,
  kind: FormTrashKind,
  id: string,
  revision: number,
) {
  const keys = sqlite()
    .transaction(() => {
      const row = deletedItem(owner, kind, id, revision);
      const condition = kind === "form" ? "form_id=?" : "response_id=?";
      const files = sqlite()
        .prepare(
          `SELECT storage_key,thumb_key FROM form_files WHERE ${condition}`,
        )
        .all(id) as { storage_key: string; thumb_key: string | null }[];
      sqlite().prepare(`DELETE FROM form_files WHERE ${condition}`).run(id);
      if (kind === "form")
        sqlite()
          .prepare(
            "DELETE FROM forms WHERE id=? AND owner_id=? AND revision=? AND trashed_at IS NOT NULL",
          )
          .run(id, owner, revision);
      else
        sqlite()
          .prepare(
            "DELETE FROM form_responses WHERE id=? AND form_id=? AND revision=? AND trashed_at IS NOT NULL",
          )
          .run(id, row.formId, revision);
      completionEvent(owner, "content", row.formId, "forms");
      return files.flatMap((file) => [
        file.storage_key,
        ...(file.thumb_key ? [file.thumb_key] : []),
      ]);
    })
    .immediate();
  await Promise.allSettled(keys.map((key) => storage.delete(key)));
}
