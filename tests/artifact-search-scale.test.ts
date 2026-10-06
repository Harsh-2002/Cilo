import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("artifact card search omits excerpts while preserving indexed matches and pagination", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "nivra-artifact-search-"),
  );
  process.env.NIVRA_DATA_DIR = directory;
  const { GET } = await import("../src/app/api/nivra/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  const { createTextArtifact, listArtifactPage } =
    await import("../src/lib/server/artifacts");
  try {
    const setup = await GET(
      new Request("http://localhost:3000/api/nivra/setup", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Search Owner",
          username: "searchowner",
          password: `Test-${randomUUID()}`,
        }),
      }),
      { params: Promise.resolve({ path: ["setup"] }) },
    );
    assert.equal(setup.status, 200);
    const owner = (
      sqlite().prepare("SELECT id FROM user").get() as { id: string }
    ).id;
    const expected = new Set<string>();
    sqlite()
      .transaction(() => {
        for (let index = 0; index < 1000; index++) {
          const item = createTextArtifact(
            owner,
            `Reference ${index}\n${"ordinary content ".repeat(60)}needlecontext hidden in the body`,
          );
          expected.add(item.id);
        }
        const removed = createTextArtifact(owner, "needlecontext removed");
        sqlite()
          .prepare("UPDATE artifacts SET trashed_at=? WHERE id=?")
          .run(Date.now(), removed.id);
      })
      .immediate();
    const seen = new Set<string>();
    let after: string | null = null;
    do {
      const card = listArtifactPage(owner, {
        limit: 60,
        query: "needlecontext",
        after,
        context: false,
      });
      const rich = listArtifactPage(owner, {
        limit: 60,
        query: "needlecontext",
        after,
      });
      assert.deepEqual(
        card.items.map((item) => item.id),
        rich.items.map((item) => item.id),
      );
      assert.equal(card.next, rich.next);
      for (const item of card.items) {
        assert.ok(expected.has(item.id));
        assert.ok(!seen.has(item.id));
        assert.equal(item.excerpt, undefined);
        assert.equal(item.excerptMatches, undefined);
        assert.ok(!item.preview.includes("needlecontext"));
        seen.add(item.id);
      }
      assert.ok(
        rich.items.every(
          (item) =>
            item.excerpt?.includes("needlecontext") &&
            item.excerptMatches?.length,
        ),
      );
      after = card.next;
    } while (after);
    assert.equal(seen.size, expected.size);
    assert.deepEqual(
      listArtifactPage(randomUUID(), {
        limit: 60,
        query: "needlecontext",
        context: false,
      }).items,
      [],
    );
    assert.deepEqual(
      listArtifactPage(owner, {
        limit: 60,
        query: "needlecontext",
        kind: "image",
        context: false,
      }).items,
      [],
    );
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
