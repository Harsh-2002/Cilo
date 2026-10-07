import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { zipSync } from "fflate";
const exec = promisify(execFile);
function pdfFixture() {
  const body =
    "0.1 0.2 0.3 rg 20 20 200 300 re f\nBT /F1 18 Tf 40 200 Td (Thumbnail fixture) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(data.length);
    data += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const start = data.length;
  data += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(data);
}
test("durable thumbnail jobs produce bounded image, PDF, video and embedded Office previews while preserving originals", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-thumbnails-"));
  process.env.NIVRA_DATA_DIR = path.join(directory, "data");
  const { sqlite } = await import("../src/lib/server/db");
  const { createFileArtifact, artifactFile } =
    await import("../src/lib/server/artifacts");
  const jobs = await import("../src/lib/server/jobs");
  const { storage } = await import("../src/lib/server/storage");
  const d = sqlite(),
    owner = randomUUID(),
    now = Date.now();
  d.prepare(
    "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  ).run(owner, "Fixture", "fixture@local.invalid", "fixture", now, now);
  try {
    const image = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: "#444444" },
    })
      .png()
      .toBuffer();
    const video = path.join(directory, "sample.mp4");
    await exec("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=gray:s=640x360:d=0.2",
      "-threads",
      "1",
      "-c:v",
      "mpeg4",
      video,
    ]);
    const samples = [
      { name: "photo.png", mime: "image/png", bytes: image },
      { name: "document.pdf", mime: "application/pdf", bytes: pdfFixture() },
      { name: "video.mp4", mime: "video/mp4", bytes: await readFile(video) },
      {
        name: "sheet.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: zipSync({ "docProps/thumbnail.png": image }),
      },
    ];
    const ids: string[] = [];
    for (const sample of samples) {
      const item = await createFileArtifact(owner, sample);
      ids.push(item.id);
      assert.equal(item.thumbnail, false);
      assert.ok(
        d
          .prepare(
            "SELECT 1 FROM background_jobs WHERE kind='thumbnail' AND target_id=? AND state='queued'",
          )
          .get(item.id),
      );
    }
    await jobs.jobsIdle();
    for (const [i, id] of ids.entries()) {
      const row = d
        .prepare(
          "SELECT storage_key,thumb_key,thumbnail_status,extraction FROM artifacts WHERE id=?",
        )
        .get(id) as {
        storage_key: string;
        thumb_key: string;
        thumbnail_status: string;
        extraction: string;
      };
      assert.equal(row.thumbnail_status, "done", samples[i].mime);
      assert.ok(row.thumb_key);
      const preview = await storage.read(row.thumb_key);
      const metadata = await sharp(preview).metadata();
      assert.equal(metadata.format, "webp");
      assert.ok(metadata.width! <= 640 && metadata.height! <= 640);
      assert.ok(preview.length <= 128 * 1024);
      if (samples[i].mime === "application/pdf") {
        const stats = await sharp(preview).stats();
        assert.ok(
          stats.channels.some((channel) => channel.mean < 240),
          "PDF preview contains page content",
        );
      }
      assert.deepEqual(
        await storage.read(row.storage_key),
        Buffer.from(samples[i].bytes),
      );
      const response = await artifactFile(
        new Request("http://localhost:3000/thumbnail"),
        owner,
        id,
        "thumbnail",
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.match(response.headers.get("cache-control")!, /no-store/);
      await assert.rejects(
        artifactFile(
          new Request("http://localhost:3000/thumbnail"),
          randomUUID(),
          id,
          "thumbnail",
        ),
      );
    }
    const photoId = ids[0];
    const oldPreview = (
      d.prepare("SELECT thumb_key FROM artifacts WHERE id=?").get(photoId) as {
        thumb_key: string;
      }
    ).thumb_key;
    d.prepare("UPDATE artifacts SET thumbnail_status='pending' WHERE id=?").run(
      photoId,
    );
    jobs.enqueueJob(owner, "thumbnail", photoId);
    const stale = jobs.claimJob()!;
    assert.equal(stale.target_id, photoId);
    d.prepare(
      "UPDATE background_jobs SET lease_token='replacement' WHERE id=?",
    ).run(stale.id);
    const createdKeys: string[] = [];
    const write = storage.write.bind(storage);
    storage.write = async (key, bytes) => {
      createdKeys.push(key);
      await write(key, bytes);
    };
    try {
      await (
        await import("../src/lib/server/artifact-thumbnails")
      ).processThumbnail({
        job: stale,
        commit: (change) => jobs.commitJob(stale, change),
      });
    } finally {
      storage.write = write;
    }
    assert.equal(createdKeys.length, 1);
    await assert.rejects(storage.read(createdKeys[0]));
    assert.equal(
      (
        d
          .prepare("SELECT thumb_key FROM artifacts WHERE id=?")
          .get(photoId) as { thumb_key: string }
      ).thumb_key,
      oldPreview,
    );
    assert.ok(await storage.read(oldPreview));
    d.prepare("DELETE FROM background_jobs WHERE id=?").run(stale.id);
    d.prepare("UPDATE artifacts SET thumbnail_status='done' WHERE id=?").run(
      photoId,
    );
    const unknown = await createFileArtifact(owner, {
      name: "binary.bin",
      mime: "application/octet-stream",
      bytes: Buffer.from([0, 1, 2, 3]),
    });
    assert.equal(
      (
        d
          .prepare(
            "SELECT count(*) AS n FROM background_jobs WHERE target_id=? AND kind='thumbnail'",
          )
          .get(unknown.id) as { n: number }
      ).n,
      0,
    );
  } finally {
    await jobs.stopJobWorker();
    d.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("thumbnail migration preserves running extraction leases and removes both jobs when the artifact is permanently deleted", async () => {
  const d = new Database(":memory:");
  try {
    d.exec(
      "CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE artifacts(id TEXT PRIMARY KEY,owner_id TEXT,extraction TEXT,content TEXT,created_at INTEGER,storage_key TEXT,mime TEXT,trashed_at INTEGER); CREATE TABLE bookmarks(id TEXT PRIMARY KEY,title TEXT);",
    );
    d.exec(
      "INSERT INTO user VALUES('owner'); INSERT INTO artifacts VALUES('photo','owner','pending','Existing text',1,'source','image/png',NULL),('office','owner','done','Office text',2,'office-source','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',NULL),('deleted','owner','done','Deleted text',3,'deleted-source','application/pdf',1);",
    );
    d.exec(await readFile("migrations/0015_background_jobs.sql", "utf8"));
    d.exec(
      "UPDATE background_jobs SET state='running',attempts=2,lease_until=90000,lease_token='lease' WHERE target_id='photo'",
    );
    const running = d
      .prepare("SELECT * FROM background_jobs WHERE target_id='photo'")
      .get();
    d.exec(await readFile("migrations/0021_artifact_thumbnails.sql", "utf8"));
    assert.deepEqual(
      d
        .prepare(
          "SELECT * FROM background_jobs WHERE kind='artifact' AND target_id='photo'",
        )
        .get(),
      running,
    );
    assert.deepEqual(
      d
        .prepare(
          "SELECT target_id FROM background_jobs WHERE kind='thumbnail' ORDER BY target_id",
        )
        .all(),
      [{ target_id: "office" }, { target_id: "photo" }],
    );
    assert.equal(
      (
        d.prepare("SELECT content FROM artifacts WHERE id='photo'").get() as {
          content: string;
        }
      ).content,
      "Existing text",
    );
    d.exec("DELETE FROM artifacts WHERE id='photo'");
    assert.equal(
      (
        d
          .prepare(
            "SELECT count(*) n FROM background_jobs WHERE target_id='photo'",
          )
          .get() as { n: number }
      ).n,
      0,
    );
  } finally {
    d.close();
  }
});
