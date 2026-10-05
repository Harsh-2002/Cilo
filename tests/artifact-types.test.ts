import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import type { Artifact, ArtifactDetail, Page } from "../src/lib/types";

const fixture = async (name: string) =>
  new Uint8Array(await readFile(`tests/fixtures/${name}`));
const header = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === "string" ? [...strToU8(part)] : part,
    ),
  );
const padded = (bytes: Uint8Array, length = 64) => {
  const out = new Uint8Array(Math.max(length, bytes.length));
  out.set(bytes);
  return out;
};
const docx = (text: string) =>
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
const xlsx = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "xl/sharedStrings.xml": strToU8(
    "<sst><si><t>Quarterly revenue</t></si><si><t>Zanzibar branch</t></si></sst>",
  ),
});
const pptx = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "ppt/slides/slide1.xml": strToU8(
    "<p:sld><a:p><a:r><a:t>Launch roadmap keynote</a:t></a:r></a:p></p:sld>",
  ),
});
const odt = zipSync({
  mimetype: strToU8("application/vnd.oasis.opendocument.text"),
  "content.xml": strToU8(
    "<office:document-content><office:body><office:text><text:p>Greenhouse irrigation schedule</text:p><text:p>Water the orchids on Tuesday</text:p></office:text></office:body></office:document-content>",
  ),
});
const archive = zipSync({
  "reports/2026/budget-final.xlsx": strToU8("x"),
  "reports/2026/lighthouse-notes.txt": strToU8("y"),
});

type Case = {
  name: string;
  bytes: () => Promise<Uint8Array> | Uint8Array;
  declared?: string;
  kind: Artifact["kind"];
  mime?: string | RegExp;
  extraction: Artifact["extraction"];
  finalExtraction?: Artifact["extraction"];
  text?: RegExp;
  find?: string;
  inline?: boolean;
  thumbnail?: boolean;
};
const cases: Case[] = [
  {
    name: "scan.png",
    bytes: () => fixture("ocr-sample.png"),
    kind: "image",
    mime: "image/png",
    extraction: "pending",
    finalExtraction: "done",
    text: /Northwind/,
    find: "northwind",
    inline: true,
  },
  {
    name: "photo.jpg",
    bytes: () => fixture("ocr-sample.jpg"),
    declared: "application/octet-stream",
    kind: "image",
    mime: "image/jpeg",
    extraction: "pending",
    finalExtraction: "done",
    text: /Northwind/,
    find: "northwind",
    inline: true,
  },
  {
    name: "shot.webp",
    bytes: () => fixture("ocr-sample.webp"),
    kind: "image",
    mime: "image/webp",
    extraction: "pending",
    finalExtraction: "done",
    text: /Northwind/,
    inline: true,
  },
  {
    name: "scan.gif",
    bytes: () => fixture("ocr-sample.gif"),
    kind: "image",
    mime: "image/gif",
    extraction: "pending",
    finalExtraction: "done",
    text: /Northwind/,
    inline: true,
  },
  {
    name: "mislabelled.png",
    bytes: () => fixture("ocr-sample.jpg"),
    declared: "image/png",
    kind: "image",
    mime: "image/jpeg",
    extraction: "pending",
    finalExtraction: "done",
    inline: true,
  },
  {
    name: "report.pdf",
    bytes: () => fixture("sample.pdf"),
    kind: "file",
    mime: "application/pdf",
    extraction: "pending",
    finalExtraction: "done",
    text: /ZX-4400[\s\S]*ZX-4401/,
    find: "harbour",
  },
  {
    name: "invoice.docx",
    bytes: () => docx("Lease agreement for the harbour office"),
    kind: "file",
    extraction: "done",
    text: /harbour office/,
    find: "harbour",
  },
  {
    name: "budget.xlsx",
    bytes: () => xlsx,
    kind: "file",
    extraction: "done",
    text: /Zanzibar branch/,
    find: "zanzibar",
  },
  {
    name: "keynote.pptx",
    bytes: () => pptx,
    kind: "file",
    extraction: "done",
    text: /Launch roadmap/,
    find: "roadmap",
  },
  {
    name: "schedule.odt",
    bytes: () => odt,
    kind: "file",
    extraction: "done",
    text: /orchids on Tuesday/,
    find: "orchids",
  },
  {
    name: "bundle.zip",
    bytes: () => archive,
    kind: "file",
    extraction: "done",
    text: /lighthouse-notes\.txt/,
    find: "lighthouse",
  },
  {
    name: "readme.md",
    bytes: () => strToU8("# Handbook\nThe quokka protocol applies"),
    kind: "file",
    extraction: "done",
    text: /quokka/,
    find: "quokka",
  },
  {
    name: "data.csv",
    bytes: () => strToU8("name,city\nIngrid,Reykjavik\n"),
    kind: "file",
    extraction: "done",
    text: /Reykjavik/,
    find: "reykjavik",
  },
  {
    name: "config.json",
    bytes: () => strToU8('{"service":"ocelot-gateway","port":8443}'),
    kind: "file",
    extraction: "done",
    text: /ocelot-gateway/,
    find: "ocelot",
  },
  {
    name: "page.html",
    bytes: () =>
      strToU8(
        "<html><head><style>p{color:red}</style><script>var hidden='nope'</script></head><body><h1>Marigold festival</h1><p>Tickets &amp; schedule</p></body></html>",
      ),
    kind: "file",
    extraction: "done",
    text: /Marigold festival[\s\S]*Tickets & schedule/,
    find: "marigold",
  },
  {
    name: "logo.svg",
    bytes: () =>
      strToU8(
        '<svg xmlns="http://www.w3.org/2000/svg"><title>Zephyr logo</title><script>alert(1)</script><text>Rooftop garden</text></svg>',
      ),
    kind: "file",
    extraction: "done",
    text: /Zephyr logo[\s\S]*Rooftop garden/,
    find: "rooftop",
  },
  {
    name: "letter.rtf",
    bytes: () =>
      strToU8(
        "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Dear Mr. Okonkwo,\\par Your caravan permit is approved.\\par}",
      ),
    kind: "file",
    extraction: "done",
    text: /Okonkwo[\s\S]*caravan permit/,
    find: "caravan",
  },
  {
    name: "tune.wav",
    bytes: () => fixture("sample.wav"),
    declared: "application/octet-stream",
    kind: "file",
    mime: "audio/wav",
    extraction: "none",
    inline: true,
  },
  {
    name: "song.mp3",
    bytes: () => fixture("sample.mp3"),
    kind: "file",
    mime: "audio/mpeg",
    extraction: "none",
    inline: true,
  },
  {
    name: "song-noid3.mp3",
    bytes: () => padded(header([0xff, 0xfb, 0x90, 0x00])),
    kind: "file",
    mime: "audio/mpeg",
    extraction: "none",
    inline: true,
  },
  {
    name: "voice.m4a",
    bytes: () => fixture("sample.m4a"),
    kind: "file",
    mime: "audio/mp4",
    extraction: "none",
    inline: true,
  },
  {
    name: "clip.mp4",
    bytes: () => fixture("sample.mp4"),
    kind: "file",
    mime: "video/mp4",
    extraction: "none",
    inline: true,
  },
  {
    name: "clip.webm",
    bytes: () => fixture("sample.webm"),
    kind: "file",
    mime: "video/webm",
    extraction: "none",
    inline: true,
  },
  {
    name: "track.ogg",
    bytes: () => fixture("sample.ogg"),
    kind: "file",
    mime: "audio/ogg",
    extraction: "none",
    inline: true,
  },
  {
    name: "lossless.flac",
    bytes: () => fixture("sample.flac"),
    kind: "file",
    mime: "audio/flac",
    extraction: "none",
    inline: true,
  },
  {
    name: "movie.mov",
    bytes: () => padded(header([0, 0, 0, 0x14], "ftypqt  ")),
    kind: "file",
    mime: "video/mp4",
    extraction: "none",
    inline: true,
  },
  {
    name: "photo.heic",
    bytes: () => padded(header([0, 0, 0, 0x18], "ftypheic")),
    kind: "file",
    extraction: "none",
  },
  {
    name: "scan.bmp",
    bytes: () =>
      padded(
        header("BM", [0x46, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28, 0, 0, 0]),
        80,
      ),
    kind: "file",
    extraction: "none",
  },
  {
    name: "tool.exe",
    bytes: () =>
      padded(header("MZ", [0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]), 128),
    kind: "file",
    extraction: "none",
  },
  {
    name: "archive.bin",
    bytes: () => new Uint8Array([0, 1, 2, 3, 0, 255, 128]),
    kind: "file",
    extraction: "none",
  },
];

test("every kind of file is stored safely, identified from its bytes, and searchable where text exists", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cilo-artifact-types-"));
  process.env.CILO_DATA_DIR = directory;
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { ocrIdle, shutdownOcr } = await import("../src/lib/server/ocr");
  let cookie = "";
  const call = (
    route: string,
    options: {
      method?: string;
      body?: BodyInit;
      json?: unknown;
      headers?: Record<string, string>;
      anonymous?: boolean;
    } = {},
  ) =>
    routes.GET(
      new Request(`http://localhost:3000/api/nivra/${route}`, {
        method: options.method || "GET",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          ...(options.json !== undefined
            ? { "content-type": "application/json" }
            : {}),
          ...(options.anonymous ? {} : { cookie }),
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
  try {
    const setup = await call("setup", {
      method: "POST",
      anonymous: true,
      json: {
        name: "Types Owner",
        username: "types",
        password: `Test-${randomUUID()}`,
      },
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const saved = new Map<string, { item: Artifact; bytes: Uint8Array }>();
    for (const entry of cases) {
      const bytes = await entry.bytes();
      const form = new FormData();
      form.set(
        "file",
        new File([bytes as BlobPart], entry.name, {
          type: entry.declared ?? "",
        }),
      );
      const item = await value<Artifact>("artifacts", {
        method: "POST",
        body: form,
      });
      saved.set(entry.name, { item, bytes });
      assert.equal(item.kind, entry.kind, entry.name);
      assert.equal(item.extraction, entry.extraction, entry.name);
      if (entry.mime)
        assert.match(item.mime, new RegExp(`^${entry.mime}$`), entry.name);
      assert.equal(item.size, bytes.length, entry.name);
    }
    await ocrIdle();
    for (const entry of cases) {
      const { item, bytes } = saved.get(entry.name)!;
      const detail = await value<ArtifactDetail>(`artifacts/${item.id}`);
      assert.equal(
        detail.extraction,
        entry.finalExtraction ?? entry.extraction,
        entry.name,
      );
      if (entry.text) assert.match(detail.content, entry.text, entry.name);
      if (entry.find) {
        const found = await value<Page<Artifact>>(
          `artifacts?q=${encodeURIComponent(entry.find)}`,
        );
        assert.ok(
          found.items.some((hit) => hit.id === item.id),
          `${entry.name} is searchable by "${entry.find}"`,
        );
      }
      // The original comes back byte for byte, with headers that keep active content inert.
      const served = await call(`artifacts/${item.id}/file`);
      assert.equal(served.status, 200, entry.name);
      assert.deepEqual(
        new Uint8Array(await served.arrayBuffer()),
        bytes,
        entry.name,
      );
      assert.equal(served.headers.get("x-content-type-options"), "nosniff");
      assert.equal(
        served.headers.get("content-security-policy"),
        "default-src 'none'; sandbox",
      );
      const inline = /^inline/.test(
        served.headers.get("content-disposition") || "",
      );
      const sniffed = served.headers.get("content-type") || "";
      if (entry.inline)
        assert.ok(
          inline &&
            sniffed === (typeof entry.mime === "string" ? entry.mime : sniffed),
          `${entry.name} should be served inline as ${sniffed}`,
        );
      else {
        assert.equal(inline, false, `${entry.name} must download, not render`);
        assert.equal(sniffed, "application/octet-stream", entry.name);
      }
    }
    // Active content is never rendered: SVG and HTML download as opaque binary.
    for (const name of ["logo.svg", "page.html"]) {
      const response = await call(`artifacts/${saved.get(name)!.item.id}/file`);
      assert.equal(
        response.headers.get("content-type"),
        "application/octet-stream",
      );
      assert.match(
        response.headers.get("content-disposition") || "",
        /^attachment/,
      );
    }
    assert.equal(saved.get("scan.png")!.item.width, 900);
    assert.equal(saved.get("scan.gif")!.item.height, 420);
    assert.equal(saved.get("shot.webp")!.item.width, 900);
    // The same text is found whichever image format carried it.
    const hits = await value<Page<Artifact>>("artifacts?q=northwind&limit=50");
    assert.deepEqual(
      new Set(hits.items.map((hit) => hit.name)),
      new Set([
        "scan.png",
        "photo.jpg",
        "shot.webp",
        "scan.gif",
        "mislabelled.png",
      ]),
    );
    const summary = await value<{
      total: number;
      images: number;
      files: number;
    }>("artifacts?summary=1");
    assert.equal(summary.images, 5);
    assert.equal(summary.total, cases.length);
  } finally {
    await shutdownOcr();
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
