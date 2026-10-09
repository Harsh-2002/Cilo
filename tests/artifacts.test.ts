import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import type {
  Artifact,
  ArtifactDetail,
  Page,
  SearchResult,
} from "../src/lib/types";

test("artifacts store anything, read text out of it, and make all of it searchable", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-artifacts-"));
  process.env.NIVRA_DATA_DIR = directory;
  const routes = await import("../src/app/api/v1/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { ocrIdle, shutdownOcr } = await import("../src/lib/server/ocr");
  let cookie = "";
  const call = (
    route: string,
    options: {
      method?: string;
      body?: BodyInit;
      json?: unknown;
      authenticated?: boolean;
      headers?: Record<string, string>;
    } = {},
  ) =>
    routes.GET(
      new Request(`http://localhost:3000/api/v1/${route}`, {
        method: options.method || "GET",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          ...(options.json !== undefined
            ? { "content-type": "application/json" }
            : {}),
          ...(options.authenticated === false ? {} : { cookie }),
          ...options.headers,
        },
        body:
          options.json !== undefined
            ? JSON.stringify(options.json)
            : options.body,
      }),
      { params: Promise.resolve({ path: route.split("?")[0].split("/") }) },
    );
  const value = async <T>(
    route: string,
    options?: Parameters<typeof call>[1],
  ) => {
    const response = await call(route, options);
    assert.ok(
      response.ok,
      `${route}: ${response.status} ${await response.clone().text()}`,
    );
    return (await response.json()) as T;
  };
  const upload = (
    name: string,
    bytes: Uint8Array,
    type: string,
    thumb?: Uint8Array,
  ) => {
    const form = new FormData();
    form.set("file", new File([bytes as BlobPart], name, { type }));
    if (thumb)
      form.set(
        "thumb",
        new File([thumb as BlobPart], "thumb.png", { type: "image/png" }),
      );
    return value<Artifact>("artifacts", { method: "POST", body: form });
  };
  try {
    const setup = await call("setup", {
      method: "POST",
      authenticated: false,
      json: {
        name: "Artifact Owner",
        username: "artifacts",
        password: `Test-${randomUUID()}`,
      },
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const sample = new Uint8Array(
      await readFile("tests/fixtures/ocr-sample.png"),
    );

    await t.test("requires authentication", async () => {
      for (const route of [
        "artifacts",
        "artifacts?summary=1",
        `artifacts/${randomUUID()}/file`,
      ])
        assert.equal(
          (await call(route, { authenticated: false })).status,
          401,
          route,
        );
    });

    await t.test(
      "pasted text is saved, titled from its first line, searchable, and editable",
      async () => {
        const saved = await value<Artifact>("artifacts", {
          method: "POST",
          json: {
            text: "\n  Passport renewal checklist\nBring two photographs and the old passport\n",
          },
        });
        assert.equal(saved.kind, "text");
        assert.equal(saved.title, "Passport renewal checklist");
        assert.match(saved.preview, /two photographs/);
        assert.equal(
          (await call("artifacts", { method: "POST", json: { text: "   " } }))
            .status,
          400,
        );
        const found = await value<Page<Artifact>>("artifacts?q=photographs");
        assert.deepEqual(
          found.items.map((item) => item.id),
          [saved.id],
        );
        assert.match(found.items[0].excerpt || "", /photographs/);
        assert.ok(found.items[0].excerptMatches?.length);
        const cards = await value<Page<Artifact>>(
          "artifacts?q=photographs&context=0",
        );
        assert.deepEqual(
          cards.items.map((item) => item.id),
          found.items.map((item) => item.id),
        );
        assert.equal(cards.items[0].excerpt, undefined);
        assert.equal(
          (await value<Page<Artifact>>("artifacts?q=photgraphs")).items.length,
          1,
        );
        const edited = await value<ArtifactDetail>(`artifacts/${saved.id}`, {
          method: "PATCH",
          json: {
            revision: saved.revision,
            content: "Renewed already\nNothing left to do",
          },
        });
        assert.equal(edited.title, "Renewed already");
        assert.equal(edited.revision, saved.revision + 1);
        assert.equal(
          (
            await call(`artifacts/${saved.id}`, {
              method: "PATCH",
              json: { revision: saved.revision, title: "stale" },
            })
          ).status,
          409,
        );
        assert.equal(
          (await value<Page<Artifact>>("artifacts?q=photographs")).items.length,
          0,
        );
      },
    );

    await t.test(
      "text files and Office documents are read after acknowledgement",
      async () => {
        const notes = await upload(
          "meeting-notes.md",
          strToU8("# Standup\nWe agreed to migrate the aurora cluster."),
          "text/markdown",
        );
        assert.equal(notes.kind, "file");
        assert.equal(notes.extraction, "pending");
        await ocrIdle();
        assert.equal(notes.title, "meeting-notes");
        const docx = zipSync({
          "[Content_Types].xml": strToU8("<Types/>"),
          "word/document.xml": strToU8(
            "<w:document><w:body><w:p><w:r><w:t>Lease agreement for the harbour office</w:t></w:r></w:p><w:p><w:r><w:t>Signed &amp; witnessed</w:t></w:r></w:p></w:body></w:document>",
          ),
        });
        const contract = await upload(
          "lease.docx",
          docx,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        assert.equal(contract.extraction, "pending");
        await ocrIdle();
        const detail = await value<ArtifactDetail>(`artifacts/${contract.id}`);
        assert.equal(
          detail.content,
          "Lease agreement for the harbour office\nSigned & witnessed",
        );
        assert.equal(
          (await value<Page<Artifact>>("artifacts?q=harbour")).items[0].id,
          contract.id,
        );
        const binary = await upload(
          "blob.bin",
          new Uint8Array([0, 1, 2, 3, 0, 255]),
          "application/octet-stream",
        );
        assert.equal(binary.extraction, "pending");
        await ocrIdle();
        assert.equal(
          (await value<ArtifactDetail>(`artifacts/${binary.id}`)).extraction,
          "none",
        );
        const served = await call(`artifacts/${binary.id}/file`);
        assert.equal(
          served.headers.get("content-disposition")?.startsWith("attachment"),
          true,
        );
        assert.equal(
          served.headers.get("content-type"),
          "application/octet-stream",
        );
      },
    );

    await t.test(
      "screenshots are read with local OCR and found by the words inside them",
      async () => {
        const image = await upload("Screenshot.png", sample, "image/png");
        assert.equal(image.kind, "image");
        assert.equal(image.mime, "image/png");
        assert.ok(image.width > 100 && image.height > 100);
        assert.equal(image.extraction, "pending");
        assert.equal(image.thumbnail, false);
        await ocrIdle();
        const read = await value<ArtifactDetail>(`artifacts/${image.id}`);
        assert.equal(read.extraction, "done");
        assert.match(read.content, /Northwind Traders/);
        assert.match(read.content, /aurora database/);
        const byWord = await value<Page<Artifact>>("artifacts?q=northwind");
        assert.deepEqual(
          byWord.items.map((item) => item.id),
          [image.id],
        );
        assert.match(byWord.items[0].excerpt || "", /Northwind/);
        const hits = await value<{ items: SearchResult[] }>(
          "search?q=invoice&mode=suggest",
        );
        assert.ok(
          hits.items.some(
            (hit) =>
              hit.type === "artifact" &&
              hit.id === image.id &&
              hit.artifactKind === "image",
          ),
        );
        assert.equal(
          (
            await value<{ items: SearchResult[] }>(
              "search?q=type%3Aartifact%20invoice&mode=suggest",
            )
          ).items.length,
          1,
        );
        assert.equal(
          (
            await value<{ items: SearchResult[] }>(
              "search?q=type%3Anote%20invoice&mode=suggest",
            )
          ).items.length,
          0,
        );
        const original = await call(`artifacts/${image.id}/file`, {
          headers: { Range: "bytes=0-7" },
        });
        assert.equal(original.status, 206);
        assert.deepEqual(
          [...new Uint8Array(await original.arrayBuffer())],
          [...sample.slice(0, 8)],
        );
        assert.equal(
          (await call(`artifacts/${image.id}/thumbnail`)).status,
          200,
        );
      },
    );

    await t.test(
      "a client thumbnail is stored when it is a real image and refused otherwise",
      async () => {
        const preview = sample;
        const withThumb = await upload(
          "with-thumb.png",
          sample,
          "image/png",
          preview,
        );
        assert.equal(withThumb.thumbnail, true);
        const served = await call(`artifacts/${withThumb.id}/thumbnail`);
        assert.equal(served.headers.get("content-type"), "image/png");
        assert.equal((await served.arrayBuffer()).byteLength, preview.length);
        const bogus = await upload(
          "bogus-thumb.png",
          sample,
          "image/png",
          strToU8("not an image at all"),
        );
        assert.equal(bogus.thumbnail, false);
        await ocrIdle();
      },
    );

    await t.test(
      "lists page newest first, filter by kind, and report counts",
      async () => {
        const first = await value<Page<Artifact>>("artifacts?limit=3");
        assert.equal(first.items.length, 3);
        assert.ok(first.next);
        const second = await value<Page<Artifact>>(
          `artifacts?limit=3&after=${encodeURIComponent(first.next!)}`,
        );
        assert.ok(
          second.items.every(
            (item) => !first.items.some((seen) => seen.id === item.id),
          ),
        );
        assert.ok(first.items[0].createdAt >= first.items[2].createdAt);
        assert.ok(
          (
            await value<Page<Artifact>>("artifacts?kind=image&limit=50")
          ).items.every((item) => item.kind === "image"),
        );
        const summary = await value<{
          total: number;
          images: number;
          texts: number;
          files: number;
        }>("artifacts?summary=1");
        assert.equal(
          summary.total,
          summary.images + summary.texts + summary.files,
        );
        assert.ok(
          summary.images >= 3 && summary.texts === 1 && summary.files >= 3,
        );
        assert.equal((await call("artifacts?kind=nonsense")).status, 400);
        assert.equal((await call("artifacts?after=garbage")).status, 400);
      },
    );

    await t.test(
      "failed readings can be retried, and Trash retains files until permanent deletion",
      async () => {
        const header = new Uint8Array(40);
        header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        header.set([0x49, 0x48, 0x44, 0x52], 12);
        header.set([0, 0, 0, 4, 0, 0, 0, 4], 16);
        const broken = await upload("broken.png", header, "image/png");
        assert.equal(broken.kind, "image");
        assert.equal(
          (await call(`artifacts/${broken.id}/extract`, { method: "POST" }))
            .status,
          200,
        );
        await ocrIdle();
        assert.equal(
          (await value<ArtifactDetail>(`artifacts/${broken.id}`)).extraction,
          "failed",
        );
        const keys = sqlite()
          .prepare("SELECT storage_key,thumb_key FROM artifacts WHERE id=?")
          .get(broken.id) as { storage_key: string; thumb_key: string | null };
        await stat(path.join(directory, "uploads", keys.storage_key));
        const current = await value<ArtifactDetail>(`artifacts/${broken.id}`);
        assert.equal(
          (
            await call(`artifacts/${broken.id}`, {
              method: "DELETE",
              json: { revision: current.revision + 5 },
            })
          ).status,
          409,
        );
        await value(`artifacts/${broken.id}`, {
          method: "DELETE",
          json: { revision: current.revision },
        });
        await stat(path.join(directory, "uploads", keys.storage_key));
        assert.equal((await call(`artifacts/${broken.id}`)).status, 404);
        await value(`trash/artifact/${broken.id}`, {
          method: "DELETE",
          json: { revision: current.revision + 1 },
        });
        await assert.rejects(
          stat(path.join(directory, "uploads", keys.storage_key)),
        );
        assert.equal((await call(`artifacts/${broken.id}`)).status, 404);
        assert.equal((await call(`artifacts/${broken.id}/file`)).status, 404);
      },
    );

    await t.test("oversized uploads are refused", async () => {
      (await import("../src/lib/server/db"))
        .sqlite()
        .prepare("UPDATE system_configuration SET upload_mib=1 WHERE id=1")
        .run();
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array(1024 * 1024 + 10)], "huge.bin"),
      );
      assert.equal(
        (await call("artifacts", { method: "POST", body: form })).status,
        413,
      );
    });
  } finally {
    await shutdownOcr();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
