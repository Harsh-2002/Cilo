import { bookmarkUrl, imageMime } from "@/lib/server/link-metadata";
import { backupStatus, startBackup, verifyBackup } from "@/lib/server/backups";
import {
  bookmarkImage,
  createBookmark,
  exportBookmarkBundle,
  deleteBookmark,
  listBookmarks,
  refreshBookmark,
  updateBookmark,
} from "@/lib/server/bookmarks";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { APIError } from "better-auth/api";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import { tagColors } from "@/lib/tags";
import { remapDocument } from "@/lib/document";
import { auth } from "@/lib/server/auth";
import { sqlite } from "@/lib/server/db";
import { storage, migrateStoredFiles } from "@/lib/server/storage";
import { uploadLimit } from "@/lib/server/config";
import {
  publicationFor,
  publishedNote,
  publishNote,
  revokePublication,
} from "@/lib/server/publications";
import { createNote, getNote, listNotes } from "@/lib/server/notes";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/lib/server/tasks";
import {
  documentInput,
  noteInput,
  plainText,
  setupInput,
  credentials,
} from "@/lib/server/validation";
import {
  checkOrigin,
  HttpError,
  json,
  readLimited,
  response,
  throttle,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Attachment = {
  id: string;
  note_id: string;
  name: string;
  mime: string;
  size: number;
  storage_key: string;
  created_at: number;
};
const recoveryHash = (code: string) =>
  createHash("sha256")
    .update(code.replaceAll("-", "").trim().toLowerCase())
    .digest("hex");
const recovery = () =>
  randomBytes(24)
    .toString("hex")
    .match(/.{1,8}/g)!
    .join("-");
const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "file";
const filesFor = (id: string) =>
  sqlite()
    .prepare("SELECT * FROM attachments WHERE note_id=?")
    .all(id) as Attachment[];
const settings = () => {
  const row = sqlite().prepare("SELECT theme FROM instance WHERE id=1").get();
  const owner = sqlite()
    .prepare("SELECT two_factor_enabled FROM user LIMIT 1")
    .get() as { two_factor_enabled: number } | undefined;
  return {
    ...(row as { theme: string }),
    uploadLimit: uploadLimit(),
    twoFactorEnabled: Boolean(owner?.two_factor_enabled),
  };
};
function needNote(id: string) {
  const note = getNote(id);
  if (!note) throw new HttpError(404, "This note was not found.");
  return note;
}
function zipResponse(files: Record<string, Uint8Array>, name: string) {
  const bytes = zipSync(files);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName(name)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const [area, id, action] = path;
    const method = request.method;
    const url = new URL(request.url);
    const database = sqlite();
    await migrateStoredFiles();
    if (method !== "GET") checkOrigin(request);
    if (area === "health" && method === "GET") {
      database.prepare("SELECT 1").get();
      return response({ status: "ok" });
    }
    if (area === "published" && method === "GET") {
      const published = publishedNote(id);
      if (!published)
        throw new HttpError(404, "This shared note is no longer available.");
      if (action === "files" && path[3]) {
        const file = database
          .prepare("SELECT * FROM publication_files WHERE token=? AND id=?")
          .get(id, path[3]) as Attachment | undefined;
        if (!file) throw new HttpError(404, "This file was not found.");
        const inline = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ].includes(file.mime);
        return new Response(
          new Uint8Array(await storage.read(file.storage_key)),
          {
            headers: {
              "Content-Type": inline ? file.mime : "application/octet-stream",
              "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName(file.name)}"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'; sandbox",
            },
          },
        );
      }
      if (action) throw new HttpError(404, "This shared note was not found.");
      return response(published);
    }
    const owner = database
      .prepare("SELECT id,name,username FROM user LIMIT 1")
      .get() as { id: string; name: string; username: string } | undefined;
    if (area === "status" && method === "GET") {
      const session = await auth(request).api.getSession({
        headers: request.headers,
      });
      return response({
        setup: !owner,
        owner: session ? owner : null,
        settings: session ? settings() : null,
      });
    }
    if (area === "setup" && method === "POST") {
      throttle("setup");
      if (owner)
        throw new HttpError(409, "Cilo is already set up. Sign in instead.");
      const input = setupInput.parse(await json(request));
      const password = await hashPassword(input.password);
      const userId = randomUUID();
      const code = recovery();
      const now = Date.now();
      database
        .transaction(() => {
          if (database.prepare("SELECT 1 FROM user").get())
            throw new HttpError(
              409,
              "Cilo is already set up. Sign in instead.",
            );
          database
            .prepare(
              "INSERT INTO user(id,name,email,username,display_username,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            )
            .run(
              userId,
              input.name,
              `${userId}@cilo.invalid`,
              input.username.toLowerCase(),
              input.username,
              now,
              now,
            );
          database
            .prepare(
              "INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              userId,
              "credential",
              userId,
              password,
              now,
              now,
            );
          database
            .prepare("UPDATE instance SET recovery_hash=?,theme=? WHERE id=1")
            .run(recoveryHash(code), input.theme);
        })
        .immediate();
      const signIn = await auth(request).api.signInUsername({
        body: { username: input.username, password: input.password },
        headers: request.headers,
        asResponse: true,
      });
      const headers = new Headers(signIn.headers);
      headers.set("Content-Type", "application/json");
      headers.set("Cache-Control", "no-store");
      return new Response(JSON.stringify({ recoveryCode: code }), { headers });
    }
    if (area === "recover" && method === "POST") {
      throttle("recover");
      const input = credentials
        .omit({ username: true })
        .extend({ code: z.string().min(30).max(100) })
        .parse(await json(request));
      const password = await hashPassword(input.password);
      const code = recovery();
      database
        .transaction(() => {
          const stored = database
            .prepare("SELECT recovery_hash AS hash FROM instance WHERE id=1")
            .get() as { hash: string | null };
          const supplied = recoveryHash(input.code);
          if (
            !owner ||
            !stored.hash ||
            !timingSafeEqual(Buffer.from(stored.hash), Buffer.from(supplied))
          )
            throw new HttpError(400, "That recovery code is not valid.");
          database
            .prepare(
              "UPDATE account SET password=?,updated_at=? WHERE user_id=? AND provider_id='credential'",
            )
            .run(password, Date.now(), owner.id);
          database.prepare("DELETE FROM session").run();
          database.prepare("DELETE FROM verification").run();
          database
            .prepare("DELETE FROM two_factor WHERE user_id=?")
            .run(owner.id);
          database
            .prepare("UPDATE user SET two_factor_enabled=0 WHERE id=?")
            .run(owner.id);
          database
            .prepare("UPDATE instance SET recovery_hash=? WHERE id=1")
            .run(recoveryHash(code));
        })
        .immediate();
      return response({ recoveryCode: code });
    }
    const session = await auth(request).api.getSession({
      headers: request.headers,
    });
    if (!session || !owner || session.user.id !== owner.id)
      throw new HttpError(401, "Please sign in to continue.");
    if (area === "settings") {
      if (method === "GET") return response(settings());
      if (method === "PATCH") {
        const input = z
          .object({
            theme: z.enum(["light", "dark", "system"]),
          })
          .strict()
          .parse(await json(request));
        database
          .prepare("UPDATE instance SET theme=? WHERE id=1")
          .run(input.theme);
        return response(settings());
      }
      if (id === "recovery" && method === "POST") {
        const input = z
          .object({ password: z.string() })
          .parse(await json(request));
        const result = await auth(request).api.verifyPassword({
          body: input,
          headers: request.headers,
        });
        if (!result.status)
          throw new HttpError(400, "The current password is incorrect.");
        const code = recovery();
        database
          .prepare("UPDATE instance SET recovery_hash=? WHERE id=1")
          .run(recoveryHash(code));
        return response({ recoveryCode: code });
      }
    }
    if (area === "backups") {
      if (method === "GET" && !id) return response(await backupStatus());
      if (method === "POST" && !id) {
        throttle(`backup:${owner.id}`);
        void startBackup().catch(() => undefined);
        return response({ accepted: true }, 202);
      }
      if (method === "POST" && id && action === "verify") {
        throttle(`backup:${owner.id}`);
        return response(await verifyBackup(id));
      }
    }
    if (area === "bookmarks") {
      if (method === "GET" && !id)
        return response(
          listBookmarks(
            owner.id,
            new URL(request.url).searchParams.get("q") || "",
          ),
        );
      if (
        method === "GET" &&
        id &&
        (action === "thumbnail" || action === "icon")
      )
        return bookmarkImage(owner.id, id, action);
      if (method === "POST" && !id) {
        throttle(`bookmark:${owner.id}`);
        const input = z
          .object({
            url: z.string().trim().min(1).max(4096),
            collection: z.string().trim().max(80).default(""),
          })
          .strict()
          .parse(await json(request));
        return response(await createBookmark(owner.id, input), 201);
      }
      if (method === "PATCH" && id) {
        const input = z
          .object({
            revision: z.number().int().positive(),
            title: z.string().trim().min(1).max(300).optional(),
            description: z.string().max(2000).optional(),
            collection: z.string().trim().max(80).optional(),
            favorite: z.boolean().optional(),
          })
          .strict()
          .refine((v) => Object.keys(v).length > 1)
          .parse(await json(request));
        return response(updateBookmark(owner.id, id, input));
      }
      if (method === "POST" && id && action === "refresh") {
        throttle(`bookmark:${owner.id}`);
        const input = z
          .object({ revision: z.number().int().positive() })
          .strict()
          .parse(await json(request));
        return response(await refreshBookmark(owner.id, id, input.revision));
      }
      if (method === "DELETE" && id) {
        const input = z
          .object({ revision: z.number().int().positive() })
          .strict()
          .parse(await json(request));
        await deleteBookmark(owner.id, id, input.revision);
        return response({ ok: true });
      }
    }
    if (area === "tasks") {
      if (method === "GET" && !id) return response(listTasks(owner.id));
      if (method === "POST" && !id) {
        const input = z
          .object({ title: z.string().trim().min(1).max(300) })
          .strict()
          .parse(await json(request));
        return response(createTask(owner.id, input.title), 201);
      }
      if (method === "PATCH" && id) {
        const input = z
          .object({
            revision: z.number().int().positive(),
            title: z.string().trim().min(1).max(300).optional(),
            completed: z.boolean().optional(),
          })
          .strict()
          .refine((v) => v.title !== undefined || v.completed !== undefined)
          .parse(await json(request));
        return response(updateTask(owner.id, id, input));
      }
      if (method === "DELETE" && id) {
        const input = z
          .object({ revision: z.number().int().positive() })
          .strict()
          .parse(await json(request));
        deleteTask(owner.id, id, input.revision);
        return response({ ok: true });
      }
    }
    if (area === "tags") {
      if (method === "GET")
        return response(
          database
            .prepare("SELECT id,name,color FROM tags ORDER BY name")
            .all(),
        );
      if (method === "POST" || method === "PATCH") {
        const { name, color } = z
          .object({
            name: z.string().trim().min(1).max(50),
            color: z.enum(tagColors).default("gray"),
          })
          .parse(await json(request));
        if (method === "POST") {
          const tagId = randomUUID();
          database
            .prepare("INSERT INTO tags(id,name,color) VALUES(?,?,?)")
            .run(tagId, name, color);
          return response({ id: tagId, name, color }, 201);
        }
        database
          .prepare("UPDATE tags SET name=?,color=? WHERE id=?")
          .run(name, color, id);
        return response({ id, name, color });
      }
      if (method === "DELETE" && id) {
        database.prepare("DELETE FROM tags WHERE id=?").run(id);
        return response({ ok: true });
      }
    }
    if (area === "notes") {
      if (id && action === "publication") {
        const note = needNote(id);
        if (method === "GET") return response(publicationFor(id));
        if (method === "POST") {
          const input = z
            .object({ revision: z.number().int().positive() })
            .parse(await json(request));
          return response(await publishNote(note, input.revision));
        }
        if (method === "DELETE") {
          await revokePublication(id);
          return response({ ok: true });
        }
      }
      if (method === "GET")
        return response(id ? needNote(id) : listNotes(url.searchParams));
      if (method === "POST" && !id) {
        const input = z
          .object({
            title: z.string().max(300).default(""),
            document: documentInput.optional(),
          })
          .parse(await json(request));
        return response(createNote(owner.id, input.title, input.document), 201);
      }
      if (method === "PATCH" && id) {
        const input = noteInput.parse(await json(request));
        const note = database
          .transaction(() => {
            const previous = needNote(id);
            if (previous.revision !== input.revision)
              throw new HttpError(
                409,
                "This note changed in another tab. Save your edits as a new note or reload it.",
              );
            const document = input.document || previous.document;
            database
              .prepare(
                "UPDATE notes SET title=?,document=?,text=?,favorite=?,trashed_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
              )
              .run(
                input.title ?? previous.title,
                JSON.stringify(document),
                plainText(document.blocks),
                Number(input.favorite ?? previous.favorite),
                input.trashed === undefined
                  ? previous.trashedAt
                  : input.trashed
                    ? Date.now()
                    : null,
                Date.now(),
                id,
                input.revision,
              );
            if (input.tags) {
              database.prepare("DELETE FROM note_tags WHERE note_id=?").run(id);
              for (const tag of new Set(input.tags))
                database
                  .prepare("INSERT INTO note_tags VALUES(?,?)")
                  .run(id, tag);
            }
            return needNote(id);
          })
          .immediate();
        if (note.trashedAt) await revokePublication(id);
        return response(note);
      }
      if (method === "POST" && action === "duplicate") {
        const original = needNote(id);
        const copy = createNote(
          owner.id,
          `${original.title || "Untitled"} (copy)`,
          original.document,
        );
        const attachmentMap = new Map<string, string>();
        const created: string[] = [];
        try {
          for (const file of filesFor(id)) {
            const newId = randomUUID();
            await storage.write(newId, await storage.read(file.storage_key));
            created.push(newId);
            database
              .prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)")
              .run(
                newId,
                copy.id,
                file.name,
                file.mime,
                file.size,
                newId,
                Date.now(),
              );
            attachmentMap.set(file.id, newId);
          }
          database.transaction(() => {
            database
              .prepare("UPDATE notes SET document=? WHERE id=?")
              .run(
                JSON.stringify(remapDocument(original.document, attachmentMap)),
                copy.id,
              );
            for (const tag of original.tags)
              database
                .prepare("INSERT INTO note_tags VALUES(?,?)")
                .run(copy.id, tag.id);
          })();
          return response(
            {
              ...needNote(copy.id),
              attachmentMap: Object.fromEntries(attachmentMap),
            },
            201,
          );
        } catch (error) {
          database.prepare("DELETE FROM notes WHERE id=?").run(copy.id);
          await Promise.all(created.map((key) => storage.delete(key)));
          throw error;
        }
      }
      if (method === "DELETE" && id) {
        if (!needNote(id).trashedAt)
          throw new HttpError(
            400,
            "Move this note to trash before deleting it permanently.",
          );
        await revokePublication(id);
        const files = filesFor(id);
        database.prepare("DELETE FROM notes WHERE id=?").run(id);
        await Promise.all(files.map((f) => storage.delete(f.storage_key)));
        return response({ ok: true });
      }
    }
    if (area === "files") {
      if (method === "GET" && id) {
        const file = database
          .prepare("SELECT * FROM attachments WHERE id=?")
          .get(id) as Attachment | undefined;
        if (!file) throw new HttpError(404, "This file was not found.");
        const inline = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ].includes(file.mime);
        return new Response(
          new Uint8Array(await storage.read(file.storage_key)),
          {
            headers: {
              "Content-Type": inline ? file.mime : "application/octet-stream",
              "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName(file.name)}"`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'; sandbox",
            },
          },
        );
      }
      if (method === "GET") {
        needNote(url.searchParams.get("note") || "");
        return response(filesFor(url.searchParams.get("note")!));
      }
      if (method === "POST") {
        const limit = (settings() as { uploadLimit: number }).uploadLimit;
        const data = await readLimited(request, limit + 1024 * 1024);
        const form = await new Request(request.url, {
          method: "POST",
          headers: {
            "content-type": request.headers.get("content-type") || "",
          },
          body: new Uint8Array(data),
        }).formData();
        const file = form.get("file");
        const noteId = form.get("note");
        if (!(file instanceof File) || typeof noteId !== "string")
          throw new HttpError(400, "Choose a file and note.");
        needNote(noteId);
        if (file.size > limit)
          throw new HttpError(413, "This file exceeds your attachment limit.");
        const fileId = randomUUID();
        const bytes = new Uint8Array(await file.arrayBuffer());
        let mime = "application/octet-stream";
        if (
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47
        )
          mime = "image/png";
        else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
          mime = "image/jpeg";
        else if (strFromU8(bytes.slice(0, 6)).startsWith("GIF8"))
          mime = "image/gif";
        else if (
          strFromU8(bytes.slice(0, 4)) === "RIFF" &&
          strFromU8(bytes.slice(8, 12)) === "WEBP"
        )
          mime = "image/webp";
        await storage.write(fileId, bytes);
        try {
          database
            .prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)")
            .run(
              fileId,
              noteId,
              file.name.slice(0, 200),
              mime,
              file.size,
              fileId,
              Date.now(),
            );
        } catch (error) {
          await storage.delete(fileId);
          throw error;
        }
        return response(
          {
            id: fileId,
            url: `/api/cilo/files/${fileId}`,
            name: file.name,
            mime,
          },
          201,
        );
      }
    }
    if (area === "export" && id === "bundle" && method === "GET") {
      const rows = database.prepare("SELECT id FROM notes").all() as {
        id: string;
      }[];
      const notes = rows.map((n) => needNote(n.id));
      const attachments = database
        .prepare("SELECT * FROM attachments")
        .all() as Attachment[];
      const bookmarkExport = await exportBookmarkBundle(owner.id);
      const files: Record<string, Uint8Array> = {
        ...bookmarkExport.files,
        "manifest.json": strToU8(
          JSON.stringify({
            format: "cilo",
            version: 1,
            notes,
            tasks: listTasks(owner.id),
            bookmarks: bookmarkExport.items,
            attachments: attachments.map((f) => ({
              id: f.id,
              note_id: f.note_id,
              name: f.name,
              mime: f.mime,
              size: f.size,
              created_at: f.created_at,
            })),
          }),
        ),
      };
      for (const file of attachments)
        files[`files/${file.id}`] = await storage.read(file.storage_key);
      return zipResponse(
        files,
        `cilo-${new Date().toISOString().slice(0, 10)}`,
      );
    }
    if (area === "export" && id === "markdown" && action && method === "POST") {
      const note = needNote(action);
      let { markdown } = z
        .object({ markdown: z.string().max(8 * 1024 * 1024) })
        .parse(await json(request));
      const files: Record<string, Uint8Array> = {};
      for (const file of filesFor(action)) {
        const name = `files/${file.id}-${safeName(file.name)}`;
        files[name] = await storage.read(file.storage_key);
        markdown = markdown.replaceAll(`/api/cilo/files/${file.id}`, name);
      }
      const visit = async (blocks: Record<string, unknown>[]) => {
        for (const block of blocks) {
          if (block.type === "canvas") {
            const props = (block.props || {}) as { scene?: string };
            const scene = JSON.parse(
              props.scene ||
                '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}',
            );
            for (const file of Object.values(scene.files || {}) as {
              attachmentId?: string;
              dataURL?: string;
            }[]) {
              if (file.attachmentId) {
                const attachment = filesFor(action).find(
                  (f) => f.id === file.attachmentId,
                );
                if (!attachment)
                  throw new HttpError(
                    400,
                    "An image in this drawing is missing.",
                  );
                file.dataURL = `data:${attachment.mime};base64,${(await storage.read(attachment.storage_key)).toString("base64")}`;
                delete file.attachmentId;
              }
            }
            const sidecar = `drawings/${String(block.id)}.excalidraw`;
            if (!markdown.includes(sidecar))
              markdown += `\n\n[Editable drawing](${sidecar})`;
            files[sidecar] = strToU8(JSON.stringify(scene));
          }
          if (Array.isArray(block.children))
            await visit(block.children as Record<string, unknown>[]);
        }
      };
      await visit(note.document.blocks);
      files[`${safeName(note.title || "Untitled")}.md`] = strToU8(
        `# ${note.title || "Untitled"}\n\n${markdown}`,
      );
      return zipResponse(files, note.title || "Untitled");
    }
    if (area === "import" && id === "bundle" && method === "POST") {
      const bytes = await readLimited(request, 100 * 1024 * 1024);
      let size = 0;
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(bytes, {
          filter: (file) => {
            size += file.originalSize;
            if (
              size > 150 * 1024 * 1024 ||
              file.originalSize > 100 * 1024 * 1024
            )
              throw new HttpError(
                413,
                "This archive expands beyond the import limit.",
              );
            return /^(manifest\.json|files\/[a-f0-9-]{36})$/.test(file.name);
          },
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "This file is not a valid Cilo archive.");
      }
      if (!entries["manifest.json"])
        throw new HttpError(400, "Choose a Cilo export bundle.");
      const manifest = z
        .object({
          format: z.literal("cilo"),
          version: z.literal(1),
          bookmarks: z
            .array(
              z.object({
                url: z.string().max(4096).transform(bookmarkUrl),
                title: z.string().trim().min(1).max(300),
                description: z.string().max(2000),
                siteName: z.string().max(100),
                collection: z.string().trim().max(80),
                favorite: z.boolean(),
                metadataStatus: z.enum(["ready", "unavailable"]),
                createdAt: z.number().int().nonnegative(),
                updatedAt: z.number().int().nonnegative(),
                thumbnail: z
                  .object({ id: z.string().uuid(), mime: z.string() })
                  .nullable(),
                icon: z
                  .object({ id: z.string().uuid(), mime: z.string() })
                  .nullable(),
              }),
            )
            .max(10000)
            .default([]),
          tasks: z
            .array(
              z.object({
                title: z.string().trim().min(1).max(300),
                completedAt: z.number().int().nonnegative().nullable(),
                createdAt: z.number().int().nonnegative(),
                updatedAt: z.number().int().nonnegative(),
              }),
            )
            .max(10000)
            .default([]),
          notes: z
            .array(
              z.object({
                id: z.string().uuid(),
                title: z.string().max(300),
                document: documentInput,
                favorite: z.boolean(),
                trashedAt: z.number().nullable(),
                createdAt: z.number(),
                updatedAt: z.number(),
                tags: z.array(
                  z.object({
                    id: z.string().uuid(),
                    name: z.string().min(1).max(50),
                    color: z.enum(tagColors).default("gray"),
                  }),
                ),
              }),
            )
            .max(10000),
          attachments: z
            .array(
              z.object({
                id: z.string().uuid(),
                note_id: z.string().uuid(),
                name: z.string().max(200),
                mime: z.string(),
                size: z.number().nonnegative(),
              }),
            )
            .max(10000),
        })
        .parse(JSON.parse(strFromU8(entries["manifest.json"])));
      const noteIds = new Map(manifest.notes.map((n) => [n.id, randomUUID()]));
      const fileIds = new Map(
        manifest.attachments.map((f) => [f.id, randomUUID()]),
      );
      if (
        noteIds.size !== manifest.notes.length ||
        fileIds.size !== manifest.attachments.length
      )
        throw new HttpError(400, "The bundle contains duplicate identifiers.");
      const created: string[] = [];
      const importedBookmarks: {
        item: (typeof manifest.bookmarks)[number];
        thumbnail: string | null;
        icon: string | null;
      }[] = [];
      if (
        new Set(manifest.bookmarks.map((b) => b.url)).size !==
        manifest.bookmarks.length
      )
        throw new HttpError(400, "The bundle contains duplicate bookmarks.");
      try {
        for (const item of manifest.bookmarks) {
          if (
            database
              .prepare("SELECT 1 FROM bookmarks WHERE owner_id=? AND url=?")
              .get(owner.id, item.url)
          )
            continue;
          const assets: { thumbnail: string | null; icon: string | null } = {
            thumbnail: null,
            icon: null,
          };
          for (const kind of ["thumbnail", "icon"] as const) {
            const asset = item[kind];
            if (!asset) continue;
            const bytes = entries[`files/${asset.id}`];
            if (
              !bytes ||
              imageMime(Buffer.from(bytes)) !== asset.mime ||
              bytes.length > 2 * 1024 * 1024
            )
              throw new HttpError(
                400,
                "The bundle has a missing or invalid bookmark preview.",
              );
            const key = randomUUID();
            await storage.write(key, bytes);
            created.push(key);
            assets[kind] = key;
          }
          importedBookmarks.push({ item, ...assets });
        }
        for (const file of manifest.attachments) {
          if (
            !noteIds.has(file.note_id) ||
            !entries[`files/${file.id}`] ||
            entries[`files/${file.id}`].length !== file.size
          )
            throw new HttpError(400, "The bundle is missing an attachment.");
          const newId = fileIds.get(file.id)!;
          await storage.write(newId, entries[`files/${file.id}`]);
          created.push(newId);
        }
        database
          .transaction(() => {
            for (const { item, thumbnail, icon } of importedBookmarks)
              database
                .prepare(
                  `INSERT INTO bookmarks(id,owner_id,url,title,description,site_name,collection,favorite,metadata_status,thumbnail_key,thumbnail_mime,icon_key,icon_mime,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                )
                .run(
                  randomUUID(),
                  owner.id,
                  item.url,
                  item.title,
                  item.description,
                  item.siteName,
                  item.collection,
                  +item.favorite,
                  item.metadataStatus,
                  thumbnail,
                  item.thumbnail?.mime || null,
                  icon,
                  item.icon?.mime || null,
                  item.createdAt,
                  item.updatedAt,
                );
            for (const task of manifest.tasks) {
              const createdTask = createTask(owner.id, task.title);
              database
                .prepare(
                  "UPDATE tasks SET completed_at=?,created_at=?,updated_at=? WHERE id=?",
                )
                .run(
                  task.completedAt,
                  task.createdAt,
                  task.updatedAt,
                  createdTask.id,
                );
            }
            for (const note of manifest.notes) {
              const parsed = remapDocument(note.document, fileIds);
              const document = JSON.stringify(parsed);
              database
                .prepare(
                  "INSERT INTO notes(id,owner_id,title,document,text,favorite,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                )
                .run(
                  noteIds.get(note.id),
                  owner.id,
                  note.title,
                  document,
                  plainText(parsed.blocks),
                  Number(note.favorite),
                  note.trashedAt,
                  note.createdAt,
                  note.updatedAt,
                );
              for (const tag of note.tags) {
                database
                  .prepare(
                    "INSERT OR IGNORE INTO tags(id,name,color) VALUES(?,?,?)",
                  )
                  .run(randomUUID(), tag.name, tag.color);
                const existing = database
                  .prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE")
                  .get(tag.name) as { id: string };
                database
                  .prepare("INSERT OR IGNORE INTO note_tags VALUES(?,?)")
                  .run(noteIds.get(note.id), existing.id);
              }
            }
            for (const file of manifest.attachments)
              database
                .prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)")
                .run(
                  fileIds.get(file.id),
                  noteIds.get(file.note_id),
                  file.name,
                  file.mime,
                  file.size,
                  fileIds.get(file.id),
                  Date.now(),
                );
          })
          .immediate();
      } catch (error) {
        await Promise.all(created.map((key) => storage.delete(key)));
        throw error;
      }
      return response({
        imported: manifest.notes.length,
        importedTasks: manifest.tasks.length,
        importedBookmarks: importedBookmarks.length,
      });
    }
    throw new HttpError(404, "This action was not found.");
  } catch (error) {
    if (error instanceof APIError)
      return response(
        {
          error:
            error.body?.message ||
            "Authentication failed. Check your credentials.",
        },
        error.statusCode,
      );
    if (error instanceof HttpError)
      return response({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return response(
        { error: "This file contains invalid document data." },
        400,
      );
    if (error instanceof z.ZodError)
      return response(
        { error: error.issues[0]?.message || "Please check the form." },
        400,
      );
    if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT"))
      return response(
        {
          error:
            "That name is already in use, or a referenced item no longer exists.",
        },
        409,
      );
    console.error(
      "Cilo request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return response(
      { error: "Cilo could not complete this action. Try again." },
      500,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
