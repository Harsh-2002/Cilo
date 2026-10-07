import { request, chromium, firefox, webkit } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
let phase = "initialization";
const fail = (error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : `Audit ${phase} failed (${error?.name || "Error"}); no credentials logged.`,
  );
  process.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
const mode = process.argv[4];
assert.ok(mode === undefined || ["--resume", "--security-only"].includes(mode));
const resume = mode !== undefined;
const root = process.argv[2];
const base = process.argv[3] || "http://localhost:3000";
assert.ok(root && path.isAbsolute(root));
const origin = new URL(base);
assert.ok(
  origin.protocol === "https:" ||
    (origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname)),
);
assert.ok(!origin.username && !origin.password);
const fixtures = JSON.parse(readFileSync(path.join(root, "fixtures.json")));
const auditState = JSON.parse(readFileSync(path.join(root, "session.json")));
const signed = encodeURIComponent(auditState.cookies[0].value);
const auditCookie = `better-auth.session_token=${signed}; __Secure-better-auth.session_token=${signed}`;
const api = await request.newContext({
  baseURL: base,
  storageState: path.join(root, "session.json"),
  extraHTTPHeaders: { Origin: base, Cookie: auditCookie },
  timeout: 60000,
});
assert.equal((await api.get("/api/nivra/notes?limit=1")).status(), 200);
const report = {
  dataset: Object.fromEntries(
    Object.entries(fixtures).map(([kind, ids]) => [kind, ids.length]),
  ),
  pagination: {},
  latency: {},
  security: [],
  browser: [],
};
if (resume) {
  Object.assign(
    report,
    JSON.parse(readFileSync(path.join(root, "report.json"))),
  );
  report.security = [];
  report.browser = [];
}
const endpoints = {
  notes: "/api/nivra/notes?view=all&preview=1&limit=60&q=Scale%20test%20note",
  journals:
    "/api/nivra/notes?view=journal&preview=1&limit=60&q=Scale%20test%20journal",
  tasks: "/api/nivra/tasks?filter=open&limit=60&q=Scale%20test%20task",
  bookmarks: "/api/nivra/bookmarks?limit=60&q=Scale%20test%20link",
  artifacts: "/api/nivra/artifacts?limit=60&q=Scale%20test&context=0",
  search: "/api/nivra/search?q=scaleprobe0999",
  overview: "/api/nivra/overview?date=2026-10-06",
};
const measured = async (url) => {
  const started = performance.now();
  const response = await api.get(url);
  const bytes = await response.body();
  assert.equal(response.status(), 200, url);
  assert.match(response.headers()["cache-control"], /no-store/);
  return {
    ms: performance.now() - started,
    bytes: bytes.length,
    body: JSON.parse(bytes.toString()),
  };
};
if (!resume) {
  for (const kind of Object.keys(fixtures)) {
    const expected = new Set(fixtures[kind]);
    const seen = new Set();
    const allSeen = new Set();
    let pages = 0;
    const collect = async (endpoint) => {
      let next = null;
      do {
        const result = await measured(
          endpoint +
            (next
              ? `&after=${encodeURIComponent(next)}`
              : kind === "notes" || kind === "journals"
                ? `&offset=${pages * 60}`
                : ""),
        );
        const items = Array.isArray(result.body)
          ? result.body
          : result.body.items;
        assert.ok(items.length <= 60);
        for (const item of items) {
          assert.ok(!allSeen.has(item.id), "Pagination has no duplicate item");
          allSeen.add(item.id);
          if (expected.has(item.id)) seen.add(item.id);
        }
        pages++;
        next = Array.isArray(result.body)
          ? items.length === 60
            ? "offset"
            : null
          : result.body.next;
        if (next === "offset") next = null;
        if (Array.isArray(result.body) && items.length === 60) {
          endpoint =
            endpoint.replace(/&offset=\d+$/, "") + `&offset=${pages * 60}`;
          next = "continue";
        }
        if (next === "continue") next = null;
        if (Array.isArray(result.body) && items.length === 60) continue;
        if (Array.isArray(result.body)) break;
      } while (next || kind === "notes" || kind === "journals");
    };
    await collect(endpoints[kind]);
    if (kind === "tasks")
      await collect(endpoints.tasks.replace("filter=open", "filter=completed"));
    assert.equal(seen.size, expected.size, kind);
    report.pagination[kind] = {
      count: seen.size,
      pages,
      existingMatches: allSeen.size - seen.size,
    };
    console.log(
      "Verified pagination",
      kind,
      seen.size,
      "items",
      pages,
      "pages",
    );
  }
  for (const [name, endpoint] of Object.entries(endpoints)) {
    await measured(endpoint);
    const samples = [];
    let maxBytes = 0;
    for (let index = 0; index < 30; index++) {
      const result = await measured(endpoint);
      samples.push(result.ms);
      maxBytes = Math.max(maxBytes, result.bytes);
    }
    samples.sort((a, b) => a - b);
    report.latency[name] = {
      requests: samples.length,
      p50Ms: Math.round(samples[14]),
      p95Ms: Math.round(samples[28]),
      maxMs: Math.round(samples.at(-1)),
      maxBytes,
    };
    console.log("Measured", name, JSON.stringify(report.latency[name]));
  }
  const concurrentStart = performance.now();
  await Promise.all(
    Array.from({ length: 10 }, async (_, lane) => {
      for (let index = 0; index < 10; index++)
        await measured(Object.values(endpoints)[(lane + index) % 7]);
    }),
  );
  report.concurrent = {
    requests: 100,
    concurrency: 10,
    totalMs: Math.round(performance.now() - concurrentStart),
  };
  writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log("Starting targeted security checks");
const anon = await request.newContext({ baseURL: base });
for (const endpoint of [
  ...Object.values(endpoints),
  "/api/nivra/events",
  `/api/nivra/artifacts/${fixtures.artifacts.find((_, index) => index === 950)}/file`,
  `/api/nivra/notes/${fixtures.notes[0]}`,
]) {
  assert.equal((await anon.get(endpoint)).status(), 401);
}
report.security.push(
  "Unauthenticated reads, search, file serving and SSE denied (401)",
);
assert.equal(
  (
    await api.post("/api/nivra/tasks", {
      headers: { Origin: "https://untrusted.example" },
      data: { title: "Cross-origin denied" },
    })
  ).status(),
  403,
);
report.security.push("Cross-origin write rejected (403)");
for (const [endpoint, data] of [
  ["tasks", { title: "x", dueDate: "invalid" }],
  [
    "notes",
    { document: { schemaVersion: 1, blocks: [{ type: "unsupported" }] } },
  ],
  ["artifacts", { text: "" }],
  ["bookmarks", { url: "file:///etc/passwd", collection: "" }],
]) {
  assert.ok(
    [400, 403].includes(
      (await api.post(`/api/nivra/${endpoint}`, { data })).status(),
    ),
    "Invalid inputs rejected",
  );
}
report.security.push(
  "Malformed documents/dates, empty artifacts and non-HTTP URL rejected",
);
const blockedUrl = `http://127.0.0.1:3000/nivra-scale-security-${Date.now()}`;
const blockedSave = await api.post("/api/nivra/bookmarks", {
  data: { url: blockedUrl, collection: "Scale test audit" },
});
assert.equal(blockedSave.status(), 201);
const blockedItem = await blockedSave.json();
let blocked;
for (let attempt = 0; attempt < 60; attempt++) {
  const items = await (
    await api.get(
      "/api/nivra/bookmarks?collection=Scale%20test%20audit&limit=60",
    )
  ).json();
  blocked = items.items.find((item) => item.id === blockedItem.id);
  if (blocked?.metadataStatus === "unavailable") break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(
  blocked?.metadataStatus,
  "unavailable",
  "Private URL metadata is blocked by the background worker",
);
assert.equal(
  (
    await api.delete(`/api/nivra/bookmarks/${blocked.id}`, {
      data: { revision: blocked.revision },
    })
  ).status(),
  200,
);
report.security.push(
  "Private URL can be saved as a link but worker refuses its metadata fetch; audit link moved to Trash",
);
assert.equal(
  (
    await api.post("/api/nivra/setup", {
      data: {
        name: "Blocked",
        username: "blocked",
        password: "SyntheticLongPassword000",
      },
    })
  ).status(),
  409,
);
assert.ok(
  [400, 403, 404].includes(
    (
      await anon.post("/api/auth/sign-up/email", {
        data: {
          name: "Blocked",
          email: "blocked@example.com",
          password: "SyntheticLongPassword000",
        },
      })
    ).status(),
  ),
);
report.security.push("Owner setup reuse and public signup blocked");
const invalidId = "00000000-0000-4000-8000-000000000000";
for (const endpoint of [
  `notes/${invalidId}`,
  `artifacts/${invalidId}/file`,
  `artifacts/${encodeURIComponent("../../encryption.key")}/file`,
])
  assert.ok(
    [400, 404].includes((await api.get(`/api/nivra/${endpoint}`)).status()),
  );
report.security.push(
  "Missing and traversal-shaped file/item identifiers denied",
);
const note = await (
  await api.get(`/api/nivra/notes/${fixtures.notes[1]}`)
).json();
const update = await api.patch(`/api/nivra/notes/${note.id}`, {
  data: { revision: note.revision, title: note.title },
});
assert.equal(update.status(), 200);
assert.equal(
  (
    await api.patch(`/api/nivra/notes/${note.id}`, {
      data: { revision: note.revision, title: "Stale write denied" },
    })
  ).status(),
  409,
);
report.security.push("Stale revision write rejected (409)");
const filePage = await measured("/api/nivra/artifacts?kind=file&limit=60");
const fixtureFiles = new Set(fixtures.artifacts);
const pdf = filePage.body.items.find(
  (item) => item.mime === "application/pdf" && fixtureFiles.has(item.id),
);
assert.ok(pdf, "A real PDF fixture exists");
const file = await api.get(`/api/nivra/artifacts/${pdf.id}/file`);
assert.equal(file.status(), 200);
assert.match(file.headers()["content-disposition"], /attachment/);
assert.equal(file.headers()["x-content-type-options"], "nosniff");
assert.match(file.headers()["cache-control"], /no-store/);
report.security.push("PDF served as download with nosniff and no-store");
for (const q of ["' OR 1=1 --", '" ) MATCH *', "<script>alert(1)</script>"]) {
  const response = await api.get(
    `/api/nivra/search?q=${encodeURIComponent(q)}`,
  );
  assert.ok([200, 400].includes(response.status()));
}
report.security.push(
  "SQL/FTS-shaped queries remain bounded and do not cause server errors",
);
const firstPage = await anon.get("/");
const secondPage = await anon.get("/");
assert.equal(firstPage.status(), 200);
const policy = firstPage.headers()["content-security-policy"];
const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
assert.ok(nonce, "Application HTML has a script nonce");
assert.notEqual(
  nonce,
  secondPage
    .headers()
    ["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1],
);
assert.ok((await firstPage.text()).includes(`nonce="${nonce}"`));
assert.ok(policy.includes("'strict-dynamic'"));
assert.equal(firstPage.headers()["x-powered-by"], undefined);
assert.equal(
  firstPage.headers()["cross-origin-resource-policy"],
  "same-origin",
);
assert.equal(firstPage.headers()["cross-origin-opener-policy"], "same-origin");
assert.ok(
  firstPage
    .headers()
    ["permissions-policy"].includes("public-key-credentials-get=(self)"),
);
report.security.push(
  "Fresh page script nonces, privacy headers and same-origin passkey permissions",
);
await anon.dispose();
console.log("Targeted security checks passed");
writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2));
if (mode === "--security-only") {
  await api.dispose();
  console.log("Targeted security audit passed.");
  process.exit(0);
}
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  phase = `${name} browser startup`;
  const browser = await engine.launch(
    name === "chromium" ? { channel: "chrome" } : {},
  );
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      storageState: {
        cookies: auditState.cookies.flatMap((cookie) => {
          const normalized = {
            ...cookie,
            value: encodeURIComponent(cookie.value),
            domain: origin.hostname,
            secure: origin.protocol === "https:",
          };
          return [
            { ...normalized, name: "better-auth.session_token" },
            ...(normalized.secure
              ? [{ ...normalized, name: "__Secure-better-auth.session_token" }]
              : []),
          ];
        }),
        origins: [],
      },
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    const pending = new Set();
    page.on("request", (r) => {
      if (
        ["fetch", "xhr"].includes(r.resourceType()) &&
        r.url().includes("/api/nivra/") &&
        !r.url().includes("/events")
      )
        pending.add(r);
    });
    page.on("requestfinished", (r) => pending.delete(r));
    page.on("requestfailed", (r) => pending.delete(r));
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [section, selector] of [
      ["notes", ".notes-list"],
      ["journal", ".notes-list"],
      ["tasks", ".tasks-panel"],
      ["bookmarks", ".bookmarks-panel"],
      ["artifacts", ".artifacts-panel"],
    ]) {
      phase = `${name} ${width} ${section} navigation`;
      const started = performance.now();
      await page.goto(base + "/" + section);
      phase = `${name} ${width} ${section} loading`;
      await page.locator(".workspace").waitFor();
      await page.locator(selector).waitFor();
      await page.waitForFunction(
        (selector) => !document.querySelector(`${selector} [aria-busy="true"]`),
        selector,
      );
      const rowSelector =
        section === "notes" || section === "journal"
          ? ".note-list-item"
          : section === "tasks"
            ? ".task-row"
            : section === "bookmarks"
              ? ".bookmark-card"
              : ".artifact-card";
      await page.locator(rowSelector).first().waitFor();
      phase = `${name} ${width} ${section} assertions`;
      const visibleItems = await page.locator(rowSelector).count();
      assert.ok(visibleItems <= 60, "Initial render is paginated");
      const ms = Math.round(performance.now() - started);
      const nodes = await page.locator("*").count();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false);
      const skeletons = await page.locator(".loading-state").count();
      assert.equal(skeletons, 0);
      report.browser.push({
        engine: name,
        width,
        section,
        loadMs: ms,
        domNodes: nodes,
        visibleItems,
      });
      if (section === "artifacts" && name === "chromium")
        await page.screenshot({
          path: path.join(root, `artifacts-${width}.png`),
        });
      await page.waitForTimeout(1500);
      for (let attempt = 0; pending.size && attempt < 100; attempt++)
        await page.waitForTimeout(100);
      assert.equal(pending.size, 0);
      console.log("Verified scale section", name, width, section);
    }
    assert.deepEqual(errors, []);
    console.log("Verified scale browser", name, width);
    await context.close();
  }
  await browser.close();
}
await api.dispose();
writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2));
console.log("Scale and targeted security audit passed.");
