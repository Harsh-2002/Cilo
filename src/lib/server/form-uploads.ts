import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { publicForm, getForm } from "./forms";
import { sqlite } from "./db";
import { HttpError } from "./http";
import { storage } from "./storage";
import { storageOperation } from "./storage-operations";
import { uploadLimit } from "./config";
import { imageInfo, isPdf } from "./extract";
import { mediaMime } from "./file-response";
import { thumbnailSupported } from "./artifact-thumbnails";

const sessionLifetime = 24 * 60 * 60 * 1000;
const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const uploadInput = z
  .object({
    fieldId: z.string().uuid(),
    filename: z.string().min(1).max(200),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();
export function createFormUploadSession(token: string, versionId: string) {
  z.string().uuid().parse(versionId);
  return sqlite()
    .transaction(() => {
      const form = publicForm(token);
      if (form.status !== "published")
        throw new HttpError(409, "This form is closed to submissions.");
      if (form.versionId !== versionId)
        throw new HttpError(409, "This form changed. Reload before uploading.");
      const active = (
        sqlite()
          .prepare(
            "SELECT count(*) AS total FROM form_upload_sessions WHERE form_id=? AND expires_at>?",
          )
          .get(form.id, Date.now()) as { total: number }
      ).total;
      if (active >= 500)
        throw new HttpError(
          429,
          "This form has too many active uploads. Try again later.",
        );
      const secret = randomBytes(32).toString("base64url");
      const id = randomUUID();
      sqlite()
        .prepare(
          "INSERT INTO form_upload_sessions(id,form_id,version_id,secret_hash,expires_at) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          form.id,
          versionId,
          hash(secret),
          Date.now() + sessionLifetime,
        );
      return { secret, expiresAt: Date.now() + sessionLifetime };
    })
    .immediate();
}
function activeSession(token: string, secret: string) {
  z.string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(secret);
  const form = publicForm(token);
  if (form.status !== "published")
    throw new HttpError(409, "This form is closed to submissions.");
  const session = sqlite()
    .prepare(
      "SELECT id FROM form_upload_sessions WHERE form_id=? AND version_id=? AND secret_hash=? AND expires_at>?",
    )
    .get(form.id, form.versionId, hash(secret), Date.now()) as
    { id: string } | undefined;
  if (!session)
    throw new HttpError(
      409,
      "This upload session expired or the form changed.",
    );
  return { form, session };
}
export function reserveFormUpload(
  token: string,
  secret: string,
  input: unknown,
) {
  const value = uploadInput.parse(input);
  if (value.size > uploadLimit())
    throw new HttpError(
      413,
      "This file exceeds the installation upload limit.",
    );
  return sqlite()
    .transaction(() => {
      const { form, session } = activeSession(token, secret);
      const field = form.definition.fields.find(
        (field) => field.id === value.fieldId && field.type === "file",
      );
      if (!field) throw new HttpError(400, "Choose a file upload question.");
      const stats = sqlite()
        .prepare(
          "SELECT count(*) AS count,coalesce(sum(size),0) AS bytes,coalesce(sum(field_id=?),0) AS fieldCount FROM form_files WHERE session_id=? AND state!='failed'",
        )
        .get(field.id, session.id) as {
        count: number;
        bytes: number;
        fieldCount: number;
      };
      if (stats.fieldCount >= field.maxFiles)
        throw new HttpError(
          413,
          `This question allows ${field.maxFiles} files.`,
        );
      if (stats.bytes + value.size > 25 * 1024 * 1024)
        throw new HttpError(413, "Response attachments exceed 25 MiB.");
      const used = (
        sqlite()
          .prepare(
            "SELECT coalesce(sum(size),0) AS bytes FROM form_files WHERE form_id=? AND state!='failed'",
          )
          .get(form.id) as { bytes: number }
      ).bytes;
      const budget = (
        sqlite()
          .prepare("SELECT upload_budget AS budget FROM forms WHERE id=?")
          .get(form.id) as { budget: number }
      ).budget;
      if (used + value.size > budget)
        throw new HttpError(
          413,
          "This form has reached its attachment storage limit.",
        );
      const id = randomUUID(),
        key = randomUUID();
      const filename = value.filename.replace(/[\\/\x00-\x1f\x7f]/g, "_");
      sqlite()
        .prepare(
          "INSERT INTO form_files(id,form_id,session_id,field_id,filename,mime,size,storage_key,created_at) VALUES(?,?,?,?,?,'application/octet-stream',?,?,?)",
        )
        .run(
          id,
          form.id,
          session.id,
          field.id,
          filename,
          value.size,
          key,
          Date.now(),
        );
      return { id, size: value.size };
    })
    .immediate();
}
function officePackage(bytes: Uint8Array, extension: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let at = bytes.length - 22;
    at >= Math.max(0, bytes.length - 65557);
    at--
  ) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    return false;
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true),
    expanded = 0;
  if (count > 1000 || at + size > end) return false;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) return false;
    const length = view.getUint16(at + 28, true),
      extra = view.getUint16(at + 30, true),
      comment = view.getUint16(at + 32, true);
    if (
      at + 46 + length + extra + comment > end ||
      view.getUint16(at + 8, true) & 1
    )
      return false;
    expanded += view.getUint32(at + 24, true);
    if (expanded > 50 * 1024 * 1024) return false;
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + length),
    );
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      /vbaProject/i.test(name)
    )
      return false;
    names.add(name);
    at += 46 + length + extra + comment;
  }
  const entry: Record<string, string> = {
    docx: "word/document.xml",
    xlsx: "xl/workbook.xml",
    pptx: "ppt/presentation.xml",
  };
  return entry[extension]
    ? names.has("[Content_Types].xml") && names.has(entry[extension])
    : names.has("mimetype") &&
        names.has("content.xml") &&
        names.has("META-INF/manifest.xml");
}
export function detectedFormFile(
  bytes: Uint8Array,
  filename: string,
): { mime: string; kind: "image" | "document" | "audio" | "video" } {
  const image = imageInfo(bytes);
  if (image) {
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 40_000_000
    )
      throw new HttpError(400, "This image is too large to process.");
    return { mime: image.mime, kind: "image" };
  }
  const media = mediaMime(bytes);
  if (media)
    return {
      mime: media,
      kind: media.startsWith("audio/") ? "audio" : "video",
    };
  if (isPdf(bytes)) return { mime: "application/pdf", kind: "document" };
  const extension = filename.split(".").pop()?.toLowerCase();
  const header = Buffer.from(bytes.subarray(0, 8)).toString("hex");
  const office: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
  };
  if (
    extension &&
    office[extension] &&
    header.startsWith("504b0304") &&
    officePackage(bytes, extension)
  )
    return { mime: office[extension], kind: "document" };
  const legacy: Record<string, string> = {
    doc: "application/msword",
    xls: "application/vnd.ms-excel",
    ppt: "application/vnd.ms-powerpoint",
  };
  if (extension && legacy[extension] && header === "d0cf11e0a1b11ae1")
    return { mime: legacy[extension], kind: "document" };
  if (extension && ["txt", "csv"].includes(extension)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) throw new Error();
      return {
        mime: extension === "csv" ? "text/csv" : "text/plain",
        kind: "document",
      };
    } catch {}
  }
  throw new HttpError(415, "This file type is not supported by forms.");
}
export async function writeFormUpload(
  token: string,
  secret: string,
  id: string,
  bytes: Uint8Array,
) {
  return storageOperation(async () => {
    const { form, session } = activeSession(token, secret);
    const file = sqlite()
      .prepare(
        "SELECT field_id AS fieldId,filename,size,storage_key AS key FROM form_files WHERE id=? AND form_id=? AND session_id=? AND state='reserved'",
      )
      .get(id, form.id, session.id) as
      | { fieldId: string; filename: string; size: number; key: string }
      | undefined;
    if (!file) throw new HttpError(404, "Upload reservation not found.");
    const claimed = sqlite()
      .prepare(
        "UPDATE form_files SET state='writing' WHERE id=? AND session_id=? AND state='reserved'",
      )
      .run(id, session.id);
    if (!claimed.changes)
      throw new HttpError(409, "This upload is already being processed.");
    let written = false;
    try {
      if (bytes.length !== file.size || !bytes.length)
        throw new HttpError(
          400,
          "The uploaded file size does not match its reservation.",
        );
      const type = detectedFormFile(bytes, file.filename);
      const field = form.definition.fields.find(
        (field) => field.id === file.fieldId,
      );
      if (!field?.fileTypes.includes(type.kind))
        throw new HttpError(
          415,
          "This question does not accept this file type.",
        );
      await storage.write(file.key, bytes);
      written = true;
      sqlite()
        .transaction(() => {
          activeSession(token, secret);
          const result = sqlite()
            .prepare(
              "UPDATE form_files SET mime=?,thumbnail_status=?,state='ready' WHERE id=? AND form_id=? AND session_id=? AND state='writing'",
            )
            .run(
              type.mime,
              thumbnailSupported(type.mime) ? "pending" : "none",
              id,
              form.id,
              session.id,
            );
          if (!result.changes)
            throw new HttpError(
              409,
              "This upload reservation is no longer available.",
            );
        })
        .immediate();
      return { id, filename: file.filename, mime: type.mime, size: file.size };
    } catch (error) {
      if (written) await storage.delete(file.key);
      sqlite()
        .prepare(
          "UPDATE form_files SET state='failed' WHERE id=? AND state='writing'",
        )
        .run(id);
      throw error;
    }
  });
}
export async function removeFormUpload(
  token: string,
  secret: string,
  id: string,
) {
  return storageOperation(async () => {
    const { form, session } = activeSession(token, secret);
    const file = sqlite()
      .prepare(
        "SELECT storage_key AS key,thumb_key AS thumbnail FROM form_files WHERE id=? AND form_id=? AND session_id=? AND response_id IS NULL",
      )
      .get(id, form.id, session.id) as
      { key: string; thumbnail: string | null } | undefined;
    if (!file) throw new HttpError(404, "Upload not found.");
    await storage.delete(file.key);
    if (file.thumbnail) await storage.delete(file.thumbnail);
    sqlite()
      .prepare("DELETE FROM form_files WHERE id=? AND response_id IS NULL")
      .run(id);
    return { ok: true };
  });
}
export async function cleanupFormUploads(now = Date.now()) {
  return storageOperation(async () => {
    const files = sqlite()
      .prepare(
        "SELECT f.id,f.storage_key AS key,f.thumb_key AS thumbnail FROM form_files f JOIN form_upload_sessions s ON s.id=f.session_id WHERE f.response_id IS NULL AND s.expires_at<=? LIMIT 100",
      )
      .all(now) as { id: string; key: string; thumbnail: string | null }[];
    for (const file of files) {
      await storage.delete(file.key);
      if (file.thumbnail) await storage.delete(file.thumbnail);
      sqlite()
        .prepare("DELETE FROM form_files WHERE id=? AND response_id IS NULL")
        .run(file.id);
    }
    sqlite()
      .transaction(() => {
        sqlite()
          .prepare(
            "UPDATE form_files SET session_id=NULL WHERE response_id IS NOT NULL AND session_id IN (SELECT id FROM form_upload_sessions WHERE expires_at<=?)",
          )
          .run(now);
        sqlite()
          .prepare(
            "DELETE FROM form_upload_sessions WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM form_files WHERE session_id=form_upload_sessions.id)",
          )
          .run(now);
      })
      .immediate();
    return files.length;
  });
}
export function formFile(owner: string, formId: string, id: string) {
  getForm(owner, formId);
  const file = sqlite()
    .prepare(
      "SELECT f.storage_key AS key,f.thumb_key AS thumbnail,f.filename,f.mime,f.size FROM form_files f JOIN form_responses r ON r.id=f.response_id AND r.form_id=f.form_id WHERE f.id=? AND f.form_id=? AND f.state='attached' AND r.trashed_at IS NULL",
    )
    .get(id, formId) as
    | {
        key: string;
        thumbnail: string | null;
        filename: string;
        mime: string;
        size: number;
      }
    | undefined;
  if (!file) throw new HttpError(404, "File not found.");
  return file;
}

const cleanupState = globalThis as unknown as {
  nivraFormCleanup?: { timer: ReturnType<typeof setInterval>; busy: boolean };
};
export async function startFormUploadCleanup() {
  if (cleanupState.nivraFormCleanup) return;
  await cleanupFormUploads();
  const state = {
    busy: false,
    timer: setInterval(() => {
      if (state.busy) return;
      state.busy = true;
      void cleanupFormUploads()
        .catch(() => console.error("Form upload cleanup failed."))
        .finally(() => {
          state.busy = false;
        });
    }, 60_000),
  };
  state.timer.unref();
  cleanupState.nivraFormCleanup = state;
}

export function formUploadReservation(
  token: string,
  secret: string,
  id: string,
) {
  const { form, session } = activeSession(token, secret);
  const reservation = sqlite()
    .prepare(
      "SELECT size FROM form_files WHERE id=? AND form_id=? AND session_id=? AND state='reserved'",
    )
    .get(id, form.id, session.id) as { size: number } | undefined;
  if (!reservation) throw new HttpError(404, "Upload reservation not found.");
  return reservation;
}
