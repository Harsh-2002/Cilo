import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const [root, base = "http://localhost:3000"] = process.argv.slice(2);
assert.ok(root && path.isAbsolute(root));
const origin = new URL(base);
assert.ok(
  origin.protocol === "https:" ||
    (origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname)),
);
assert.ok(!origin.username && !origin.password);
const fixtures = JSON.parse(readFileSync(path.join(root, "fixtures.json")));
const tags = JSON.parse(readFileSync(path.join(root, "fixture-tags.json")));
const state = JSON.parse(readFileSync(path.join(root, "session.json")));
const cookie = encodeURIComponent(state.cookies[0].value);
const headers = {
  Cookie: `better-auth.session_token=${cookie}; __Secure-better-auth.session_token=${cookie}`,
  Origin: base,
};
let phase = "initialization";
async function api(route, body) {
  const response = await fetch(`${base}/api/nivra/${route}`, {
    headers: {
      ...headers,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { method: "PATCH", body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, `API status in ${phase}`);
  assert.match(response.headers.get("cache-control"), /no-store/);
  return response.json();
}
const report = {
  favoriteNotes: 0,
  favoriteBookmarks: 0,
  tags: 0,
  taggedItems: 0,
  universalTags: false,
  mixedFavorites: 0,
  deepSearch: false,
  typeFilters: false,
};
try {
  phase = "favorite note pagination";
  const expected = new Set(
    [...fixtures.notes, ...fixtures.journals].filter(
      (_, index) => index % 4 === 0,
    ),
  );
  const seen = new Set();
  for (let offset = 0; ; offset += 60) {
    const rows = await api(
      `notes?view=favorites&preview=1&limit=60&offset=${offset}&q=Scale%20test`,
    );
    for (const row of rows) {
      assert.ok(row.favorite);
      assert.ok(expected.has(row.id));
      assert.ok(!seen.has(row.id));
      seen.add(row.id);
    }
    if (rows.length < 60) break;
  }
  assert.equal(seen.size, expected.size);
  report.favoriteNotes = seen.size;
  phase = "favorite bookmark pagination";
  const expectedLinks = new Set(
    fixtures.bookmarks.filter((_, index) => index % 4 === 0),
  );
  const seenLinks = new Set();
  let after = "";
  do {
    const page = await api(
      `bookmarks?favorite=1&limit=60&q=Scale%20test${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    for (const row of page.items) {
      assert.ok(row.favorite);
      assert.ok(expectedLinks.has(row.id));
      assert.ok(!seenLinks.has(row.id));
      seenLinks.add(row.id);
    }
    after = page.next;
  } while (after);
  assert.equal(seenLinks.size, expectedLinks.size);
  report.favoriteBookmarks = seenLinks.size;
  phase = "mixed favorite pagination";
  const expectedFavorites = new Set(
    [...seen]
      .map((id) => `note:${id}`)
      .concat([...seenLinks].map((id) => `bookmark:${id}`)),
  );
  const mixedSeen = new Set();
  for (let offset = 0; offset !== null;) {
    const page = await api(
      `favorites?limit=60&offset=${offset}&q=Scale%20test`,
    );
    for (const row of page.items) {
      const key = `${row.type}:${row.id}`;
      assert.ok(row.favorite);
      assert.ok(expectedFavorites.has(key));
      assert.ok(!mixedSeen.has(key));
      mixedSeen.add(key);
    }
    offset = page.next;
  }
  assert.equal(mixedSeen.size, expectedFavorites.size);
  report.mixedFavorites = mixedSeen.size;
  phase = "all tag filters";
  for (let index = 0; index < tags.tags.length; index++) {
    const rows = await api(
      `notes?view=all&preview=1&limit=60&tag=${encodeURIComponent(tags.tags[index])}&q=Scale%20test`,
    );
    assert.ok(rows.length);
    assert.ok(
      rows.every((row) => row.tags.some((tag) => tag.id === tags.tags[index])),
    );
    const found = await api(
      `search?q=${encodeURIComponent(`type:note tag:"${tags.labels[index]}" scale`)}`,
    );
    assert.ok(found.length);
    assert.ok(found.every((row) => row.type === "note"));
    const allowed = new Set(
      [...fixtures.notes, ...fixtures.journals].filter(
        (_, position) =>
          (position % 10000) % tags.tags.length === index ||
          ((position % 10000) + 7) % tags.tags.length === index,
      ),
    );
    assert.ok(found.every((row) => allowed.has(row.id)));
    const collection = await api(`tags/${tags.tags[index]}/items?limit=60`);
    assert.ok(collection.items.length);
    assert.ok(
      collection.items.every((row) =>
        row.tags.some((tag) => tag.id === tags.tags[index]),
      ),
    );
    for (const type of ["task", "bookmark", "artifact"]) {
      const results = await api(
        `search?q=${encodeURIComponent(`type:${type} tag:"${tags.labels[index]}" scale`)}`,
      );
      const fixtureType = `${type}s`;
      const permitted = new Set(
        fixtures[fixtureType].filter(
          (_, position) =>
            position % tags.tags.length === index ||
            (position + 7) % tags.tags.length === index,
        ),
      );
      assert.ok(results.length);
      assert.ok(
        results.every((row) => row.type === type && permitted.has(row.id)),
      );
    }
    report.tags++;
  }
  phase = "mixed item tag pagination";
  const expectedTagged = new Set(
    Object.entries(fixtures).flatMap(([section, ids]) =>
      ids
        .filter(
          (_, position) =>
            position % tags.tags.length === 0 ||
            (position + 7) % tags.tags.length === 0,
        )
        .map(
          (id) =>
            `${section === "journals" ? "note" : section.slice(0, -1)}:${id}`,
        ),
    ),
  );
  const taggedSeen = new Set();
  const kinds = new Set();
  let offset = 0;
  do {
    const page = await api(
      `tags/${tags.tags[0]}/items?limit=60&offset=${offset}`,
    );
    for (const row of page.items) {
      const identity = `${row.type}:${row.id}`;
      assert.ok(expectedTagged.has(identity));
      assert.ok(!taggedSeen.has(identity));
      assert.ok(row.tags.some((tag) => tag.id === tags.tags[0]));
      taggedSeen.add(identity);
      kinds.add(row.dailyDate ? "journal" : row.type);
      if (row.type === "artifact") assert.equal(row.excerpt, "");
    }
    offset = page.next;
  } while (offset !== null);
  assert.equal(taggedSeen.size, expectedTagged.size);
  assert.deepEqual(
    kinds,
    new Set(["note", "journal", "task", "bookmark", "artifact"]),
  );
  report.taggedItems = taggedSeen.size;
  report.universalTags = true;
  phase = "deep text indexing";
  const token = "deepfiftythousandneedle";
  const note = await api(`notes/${fixtures.notes[0]}`);
  if (!JSON.stringify(note.document).includes(token))
    await api(`notes/${note.id}`, {
      revision: note.revision,
      document: {
        ...note.document,
        blocks: [
          ...note.document.blocks,
          {
            type: "paragraph",
            content: [{ type: "text", text: token, styles: {} }],
          },
        ],
      },
    });
  const artifact = await api(`artifacts/${fixtures.artifacts[0]}`);
  if (!artifact.content.includes(token))
    await api(`artifacts/${artifact.id}`, {
      revision: artifact.revision,
      content: `${artifact.content}\n${token}`,
    });
  const found = await api(`search?q=${token}`);
  assert.equal(
    found.filter((row) => row.type === "note" && row.id === note.id).length,
    1,
  );
  assert.equal(
    found.filter((row) => row.type === "artifact" && row.id === artifact.id)
      .length,
    1,
  );
  assert.ok(
    found.every(
      (row) => row.excerptMatches?.length && row.excerpt.includes(token),
    ),
  );
  const scoped = await api(
    `search?q=${encodeURIComponent(`type:note tag:"${tags.labels[0]}" ${token}`)}`,
  );
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].id, note.id);
  report.deepSearch = true;
  phase = "all type filters";
  for (const type of ["note", "task", "bookmark", "artifact"]) {
    const rows = await api(
      `search?q=${encodeURIComponent(`type:${type} scale`)}`,
    );
    assert.ok(rows.length);
    assert.ok(rows.every((row) => row.type === type));
  }
  report.typeFilters = true;
  writeFileSync(
    path.join(root, "filter-audit.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    `Library filter audit failed in ${phase} (${error.name}); private responses omitted.`,
  );
  process.exitCode = 1;
}
