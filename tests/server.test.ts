import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

test("Cilo protects ownership and preserves notes, artifacts, and recovery", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cilo-test-"));
  process.env.CILO_DATA_DIR = directory;
  const routes = await import("../src/app/api/cilo/[...path]/route");
  const authRoute = await import("../src/app/api/auth/[...all]/route");
  const { sqlite } = await import("../src/lib/server/db");
  let cookie = "";
  let recovery = "";
  let noteId = "";
  let fileId = "";
  const password = `Test-${randomUUID()}`;
  const request = (
    route: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) => {
    const headers: Record<string, string> = {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    };
    if (authenticated) headers.cookie = cookie;
    if (body && !(body instanceof FormData) && !(body instanceof Uint8Array))
      headers["content-type"] = "application/json";
    return new Request(`http://localhost:3000/api/cilo/${route}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData || body instanceof Uint8Array
            ? (body as BodyInit)
            : JSON.stringify(body),
    });
  };
  const call = (
    route: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) =>
    routes.GET(request(route, method, body, authenticated), {
      params: Promise.resolve({ path: route.split("?")[0].split("/") }),
    });
  try {
    await t.test(
      "concurrent onboarding creates one owner and blocks signup",
      async () => {
        const input = { username: "tester", name: "Test Owner", password };
        const results = await Promise.all([
          call("setup", "POST", input, false),
          call("setup", "POST", input, false),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const result = results.find((r) => r.status === 200)!;
        cookie = result.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; ");
        recovery = (await result.json()).recoveryCode;
        assert.ok(cookie);
        assert.ok(recovery);
        assert.equal(
          (
            sqlite().prepare("SELECT count(*) AS count FROM user").get() as {
              count: number;
            }
          ).count,
          1,
        );
        const signup = await authRoute.POST(
          new Request("http://localhost:3000/api/auth/sign-up/email", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "http://localhost:3000",
              host: "localhost:3000",
            },
            body: JSON.stringify({
              email: "second@example.invalid",
              name: "Second",
              password,
            }),
          }),
        );
        assert.ok(signup.status >= 400);
        assert.throws(
          () =>
            sqlite()
              .prepare(
                "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('extra','Extra','extra@cilo.invalid','extra',0,0)",
              )
              .run(),
          /already has an owner/,
        );
      },
    );
    await t.test(
      "private endpoints and cross-origin writes are protected",
      async () => {
        assert.equal(
          (await call("notes", "GET", undefined, false)).status,
          401,
        );
        const req = request("notes", "POST", {});
        req.headers.set("origin", "https://other.invalid");
        assert.equal(
          (
            await routes.POST(req, {
              params: Promise.resolve({ path: ["notes"] }),
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "revision conflicts and FTS track edits, tags, and trash",
      async () => {
        const created = await call("notes", "POST", { title: "Ideas" });
        assert.equal(created.status, 201);
        const note = await created.json();
        noteId = note.id;
        const tag = await (
          await call("tags", "POST", { name: "Projects" })
        ).json();
        const document = {
          schemaVersion: 1,
          blocks: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "A searchable thought", styles: {} },
              ],
            },
            {
              type: "codeBlock",
              content: [
                { type: "text", text: "const durableIdea = true;", styles: {} },
              ],
            },
            {
              id: randomUUID(),
              type: "canvas",
              props: {
                scene: JSON.stringify({
                  elements: [{ text: "CanvasLabel" }],
                  appState: {},
                  files: {},
                }),
                preview: "",
              },
            },
          ],
        };
        const saved = await call(`notes/${noteId}`, "PATCH", {
          revision: 1,
          document,
          tags: [tag.id],
          favorite: true,
        });
        assert.equal(saved.status, 200);
        assert.equal(
          (
            await call(`notes/${noteId}`, "PATCH", {
              revision: 1,
              title: "stale",
            })
          ).status,
          409,
        );
        for (const q of ["searchable", "durableIdea", "CanvasLabel"])
          assert.equal((await (await call(`notes?q=${q}`)).json()).length, 1);
        assert.equal(
          (await (await call(`notes?tag=${tag.id}&view=favorites`)).json())
            .length,
          1,
        );
        assert.equal(
          (
            await call(`notes/${noteId}`, "PATCH", {
              revision: 2,
              document: {
                schemaVersion: 1,
                blocks: [{ type: "unknownBlock" }],
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(`notes/${noteId}`, "PATCH", {
              revision: 2,
              trashed: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (await (await call("notes?q=searchable")).json()).length,
          0,
        );
        assert.equal((await (await call("notes?view=trash")).json()).length, 1);
        assert.equal(
          (
            await call(`notes/${noteId}`, "PATCH", {
              revision: 3,
              trashed: false,
            })
          ).status,
          200,
        );
        assert.equal((await call(`notes/${noteId}`, "DELETE")).status, 400);
        assert.equal((await call(`tags/${tag.id}`, "DELETE")).status, 200);
        assert.equal(
          (await (await call(`notes/${noteId}`)).json()).tags.length,
          0,
        );
        assert.equal(
          (await call("tags", "POST", { name: "ideas" })).status,
          201,
        );
        assert.equal(
          (await call("tags", "POST", { name: "IDEAS" })).status,
          409,
        );
      },
    );
    await t.test(
      "uploads stay private and active formats download safely",
      async () => {
        const form = new FormData();
        form.set("note", noteId);
        form.set(
          "file",
          new File([await readFile("public/icons/icon-192.png")], "image.png", {
            type: "image/png",
          }),
        );
        const uploaded = await call("files", "POST", form);
        assert.equal(uploaded.status, 201);
        fileId = (await uploaded.json()).id;
        assert.equal(
          (await call(`files/${fileId}`, "GET", undefined, false)).status,
          401,
        );
        const image = await call(`files/${fileId}`);
        assert.equal(image.headers.get("content-type"), "image/png");
        const active = new FormData();
        active.set("note", noteId);
        active.set(
          "file",
          new File(["<script>alert(1)</script>"], "page.html", {
            type: "text/html",
          }),
        );
        const htmlId = (await (await call("files", "POST", active)).json()).id;
        assert.equal(
          (await call(`files/${htmlId}`)).headers.get("content-type"),
          "application/octet-stream",
        );
        assert.equal((await call("files/not-a-storage-key")).status, 404);
        const oversize = request("files", "POST");
        oversize.headers.set("content-length", String(30 * 1024 * 1024));
        assert.equal(
          (
            await routes.POST(oversize, {
              params: Promise.resolve({ path: ["files"] }),
            })
          ).status,
          413,
        );
      },
    );
    await t.test(
      "bundle import preserves artifacts and remaps file references",
      async () => {
        const note = await (await call(`notes/${noteId}`)).json();
        note.document.blocks.push({
          type: "paragraph",
          content: [{ type: "text", text: fileId, styles: {} }],
        });
        note.document.blocks.push({
          type: "image",
          props: { url: `/api/cilo/files/${fileId}`, name: "image.png" },
        });
        assert.equal(
          (
            await call(`notes/${noteId}`, "PATCH", {
              revision: note.revision,
              document: note.document,
            })
          ).status,
          200,
        );
        const duplicate = await (
          await call(`notes/${noteId}/duplicate`, "POST")
        ).json();
        assert.ok(
          duplicate.document.blocks.some(
            (block: { content?: { text?: string }[] }) =>
              block.content?.some((part) => part.text === fileId),
          ),
        );
        assert.ok(duplicate.attachmentMap[fileId]);
        assert.notEqual(
          duplicate.document.blocks.find(
            (b: { type: string }) => b.type === "image",
          ).props.url,
          `/api/cilo/files/${fileId}`,
        );
        assert.equal(
          (await call(`files/${duplicate.attachmentMap[fileId]}`)).status,
          200,
        );
        assert.equal(
          (await call(`notes/${duplicate.id}`, "DELETE")).status,
          400,
        );
        assert.equal(
          (
            await call(`notes/${duplicate.id}`, "PATCH", {
              revision: duplicate.revision,
              trashed: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (await call(`notes/${duplicate.id}`, "DELETE")).status,
          200,
        );
        const bundle = await call("export/bundle");
        assert.equal(bundle.status, 200);
        const imported = await call(
          "import/bundle",
          "POST",
          new Uint8Array(await bundle.arrayBuffer()),
        );
        assert.equal(imported.status, 200);
        assert.equal((await imported.json()).imported, 1);
        const rows = await (await call("notes")).json();
        assert.equal(rows.length, 2);
        const copy = await (
          await call(
            `notes/${rows.find((n: { id: string }) => n.id !== noteId).id}`,
          )
        ).json();
        assert.ok(
          copy.document.blocks.some(
            (b: { type: string }) => b.type === "canvas",
          ),
        );
        const url = copy.document.blocks.find(
          (b: { type: string }) => b.type === "image",
        ).props.url;
        assert.notEqual(url, `/api/cilo/files/${fileId}`);
        assert.ok(
          copy.document.blocks.some(
            (block: { content?: { text?: string }[] }) =>
              block.content?.some((part) => part.text === fileId),
          ),
        );
        assert.equal((await call(url.replace("/api/cilo/", ""))).status, 200);
        const malformed = zipSync({
          "manifest.json": strToU8('{"format":"wrong"}'),
        });
        assert.equal(
          (await call("import/bundle", "POST", malformed)).status,
          400,
        );
        const invalidPaths = zipSync({
          "manifest.json": strToU8(
            JSON.stringify({
              format: "cilo",
              version: 1,
              notes: [
                {
                  ...note,
                  document: {
                    schemaVersion: 1,
                    blocks: [
                      {
                        id: "../../unsafe",
                        type: "canvas",
                        props: { scene: "" },
                      },
                    ],
                  },
                },
              ],
              attachments: [],
            }),
          ),
        });
        assert.equal(
          (await call("import/bundle", "POST", invalidPaths)).status,
          400,
        );
        assert.equal(
          (await call("import/bundle", "POST", new Uint8Array([1, 2, 3])))
            .status,
          400,
        );
        assert.equal(
          (
            await call(
              "import/bundle",
              "POST",
              zipSync({ "manifest.json": strToU8("{") }),
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "Markdown packages embed drawing images in editable sidecars",
      async () => {
        const note = await (await call(`notes/${noteId}`)).json();
        const canvas = note.document.blocks.find(
          (b: { type: string }) => b.type === "canvas",
        );
        const scene = JSON.parse(canvas.props.scene);
        scene.files = {
          image: { id: "image", mimeType: "image/png", attachmentId: fileId },
        };
        canvas.props.scene = JSON.stringify(scene);
        assert.equal(
          (
            await call(`notes/${noteId}`, "PATCH", {
              revision: note.revision,
              document: note.document,
            })
          ).status,
          200,
        );
        const exported = await call(`export/markdown/${noteId}`, "POST", {
          markdown: `![Image](/api/cilo/files/${fileId})`,
        });
        assert.equal(exported.status, 200);
        const entries = unzipSync(new Uint8Array(await exported.arrayBuffer()));
        const sidecar = JSON.parse(
          strFromU8(entries[`drawings/${canvas.id}.excalidraw`]),
        );
        assert.ok(
          sidecar.files.image.dataURL.startsWith("data:image/png;base64,"),
        );
        assert.equal(sidecar.files.image.attachmentId, undefined);
        const markdown = strFromU8(
          Object.entries(entries).find(([name]) => name.endsWith(".md"))![1],
        );
        assert.ok(markdown.includes(`drawings/${canvas.id}.excalidraw`));
        assert.ok(!markdown.includes("/api/cilo/files/"));
      },
    );
    await t.test(
      "recovery is single-use and invalidates existing sessions",
      async () => {
        const newPassword = `New-${randomUUID()}`;
        const recovered = await call(
          "recover",
          "POST",
          { code: recovery, password: newPassword },
          false,
        );
        assert.equal(recovered.status, 200);
        const next = await recovered.json();
        assert.notEqual(next.recoveryCode, recovery);
        assert.equal((await call("notes")).status, 401);
        assert.equal(
          (
            await call(
              "recover",
              "POST",
              { code: recovery, password: newPassword },
              false,
            )
          ).status,
          400,
        );
        const login = await authRoute.POST(
          new Request("http://localhost:3000/api/auth/sign-in/username", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "http://localhost:3000",
              host: "localhost:3000",
            },
            body: JSON.stringify({ username: "tester", password: newPassword }),
          }),
        );
        assert.equal(login.status, 200);
        cookie = login.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; ");
        assert.equal((await call("notes")).status, 200);
        assert.equal(
          (await call("settings/recovery", "POST", { password: "wrong" }))
            .status,
          400,
        );
        assert.equal(
          (await call("settings/recovery", "POST", { password: newPassword }))
            .status,
          200,
        );
      },
    );
    await t.test(
      "reopening SQLite preserves data and does not replay migrations",
      async () => {
        const count = (
          sqlite().prepare("SELECT count(*) AS n FROM notes").get() as {
            n: number;
          }
        ).n;
        sqlite().close();
        delete (globalThis as unknown as { ciloSqlite?: unknown }).ciloSqlite;
        assert.equal(
          (
            sqlite().prepare("SELECT count(*) AS n FROM notes").get() as {
              n: number;
            }
          ).n,
          count,
        );
        assert.equal(
          (
            sqlite().prepare("PRAGMA integrity_check").get() as {
              integrity_check: string;
            }
          ).integrity_check,
          "ok",
        );
      },
    );
  } finally {
    sqlite().close();
    delete (globalThis as unknown as { ciloSqlite?: unknown }).ciloSqlite;
    await rm(directory, { recursive: true, force: true });
  }
});
