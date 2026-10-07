import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  bookmarkUrl,
  parseMetadata,
  publicAddress,
  fetchPublic,
  imageMime,
} from "../src/lib/server/link-metadata";
test("link previews reject internal destinations and unsafe protocols", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "0.0.0.0",
    "169.254.169.254",
    "192.168.2.4",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2002:7f00:1::",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pass@example.com",
  ])
    assert.throws(() => bookmarkUrl(url));
  await assert.rejects(
    fetchPublic("http://127.0.0.1/", 1000, AbortSignal.timeout(1000)),
    /Private network/,
  );
  await assert.rejects(
    fetchPublic("http://[::1]/", 1000, AbortSignal.timeout(1000)),
    /Private network/,
  );
});
test("metadata extracts Open Graph, Twitter and HTML with safe relative assets", () => {
  const info = parseMetadata(
    `<script>const fake='<meta property="og:title" content="fake">'</script><title>fallback</title><meta content='Saved &amp; useful' property='og:title'><meta name=description content='A useful reference'><meta property="og:image" content="/cover.png"><link rel="shortcut icon" href="/favicon.ico"><meta property="og:site_name" content="Example">`,
    "https://example.com/page",
  );
  assert.equal(info.title, "Saved & useful");
  assert.equal(info.description, "A useful reference");
  assert.equal(info.thumbnail, "https://example.com/cover.png");
  assert.equal(info.icon, "https://example.com/favicon.ico");
  assert.equal(info.siteName, "Example");
  assert.equal(
    parseMetadata(
      '<meta property="og:image" content="javascript:alert(1)">',
      "https://example.com",
    ).thumbnail,
    "",
  );
  assert.equal(
    parseMetadata("<title>Only a title</title>", "https://example.com")
      .thumbnail,
    "",
  );
  assert.equal(imageMime(Buffer.from("<svg onload=alert(1)>")), null);
});
test("bookmarks preserve fallback links, organization, FTS and revisions", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nivra-bookmark-test-"),
  );
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const bookmarks = await import("../src/lib/server/bookmarks");
  const { jobsIdle, stopJobWorker } = await import("../src/lib/server/jobs");
  const db = sqlite(),
    owner = randomUUID();
  try {
    db.prepare(
      "INSERT INTO user(id,name,email,email_verified,username,created_at,updated_at) VALUES(?,?,?,0,?,?,?)",
    ).run(
      owner,
      "Fixture",
      "fixture@local.invalid",
      "fixture",
      Date.now(),
      Date.now(),
    );
    const b = await bookmarks.createBookmark(owner, {
      url: "http://127.0.0.1/private",
      collection: "Reading",
    });
    assert.equal(b.metadataStatus, "pending");
    await jobsIdle();
    assert.equal(
      bookmarks.listBookmarks(owner)[0].metadataStatus,
      "unavailable",
    );
    assert.equal(b.url, "http://127.0.0.1/private");
    await assert.rejects(
      bookmarks.createBookmark(owner, { url: b.url, collection: "" }),
      /already saved/,
    );
    const updated = bookmarks.updateBookmark(owner, b.id, {
      revision: b.revision,
      title: "Concurrency handbook",
      description: "SQLite indexing guide",
      favorite: true,
    });
    assert.equal(bookmarks.listBookmarks(owner, "index").length, 1);
    assert.equal(bookmarks.listBookmarks(owner, "curren").length, 1);
    assert.equal(bookmarks.listBookmarks(owner, "Reading").length, 1);
    assert.equal(updated.favorite, true);
    assert.equal(bookmarks.listBookmarks(owner, "concurency").length, 1);
    assert.throws(
      () =>
        bookmarks.updateBookmark(owner, b.id, {
          revision: b.revision,
          title: "Stale",
        }),
      /changed/,
    );
    assert.throws(
      () =>
        bookmarks.updateBookmark("another-owner", b.id, {
          revision: updated.revision,
          title: "Stolen",
        }),
      /not found/,
    );
    const refreshing = await bookmarks.refreshBookmark(
      owner,
      b.id,
      updated.revision,
    );
    assert.equal(refreshing.metadataStatus, "pending");
    await jobsIdle();
    assert.equal(
      bookmarks.listBookmarks(owner)[0].metadataStatus,
      "unavailable",
    );
    assert.equal(bookmarks.listBookmarks(owner)[0].title, updated.title);
    await bookmarks.deleteBookmark(owner, b.id, refreshing.revision);
    assert.equal(bookmarks.listBookmarks(owner, "handbook").length, 0);
  } finally {
    await stopJobWorker();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
