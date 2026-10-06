import { chromium, firefox, webkit, request } from "playwright";
import { realpathSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = realpathSync(process.argv[2]);
assert.ok(root.startsWith("/tmp/nivra-layout-review-"));
const base = "http://localhost:3004";
const api = await request.newContext({
  baseURL: base,
  storageState: path.join(root, "session.json"),
  extraHTTPHeaders: { Origin: base },
});
assert.equal(
  (await (await api.get("/api/nivra/status")).json()).owner?.name,
  "Layout Review Owner",
);
const response = await api.post("/api/nivra/notes", {
  data: { title: "Route review note" },
});
assert.equal(response.status(), 201);
const note = await response.json();
const routes = [
  ["Overview", "/overview"],
  ["Notes", "/notes"],
  ["Favorites", "/favorites"],
  ["Journal", "/journal"],
  ["Tasks", "/tasks"],
  ["Bookmarks", "/bookmarks"],
  ["Artifacts", "/artifacts"],
  ["Trash", "/trash"],
];
let cases = 0;
let guardVerified = false;
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  if (process.argv[3] && process.argv[3] !== name) continue;
  const browser = await engine.launch(
    name === "chromium" ? { channel: "chrome" } : {},
  );
  try {
    for (const width of [390, 1440]) {
      if (process.argv[4] && Number(process.argv[4]) !== width) continue;
      const context = await browser.newContext({
        storageState: path.join(root, "session.json"),
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const errors = [];
      const pending = new Set();
      page.on("request", (request) => {
        if (
          ["fetch", "xhr"].includes(request.resourceType()) &&
          request.url().includes("/api/nivra/") &&
          !request.url().includes("/events")
        )
          pending.add(request);
      });
      page.on("requestfinished", (request) => pending.delete(request));

      page.on("requestfailed", (request) => pending.delete(request));
      const settle = async () => {
        await page.waitForTimeout(1500);
        await page.waitForFunction(
          () => !document.querySelector('[aria-busy="true"]'),
        );
        for (let attempt = 0; pending.size && attempt < 100; attempt++)
          await page.waitForTimeout(100);
        assert.equal(
          pending.size,
          0,
          "Section requests settled before document navigation: " +
            [...pending].map((r) => r.url()).join(", "),
        );
      };
      page.on("pageerror", (error) => errors.push(error.message));
      page.setDefaultTimeout(15000);
      const nav = page.locator(
        width < 1024 ? ".mobile-navigation" : ".desktop-navigation",
      );
      const select = async (label) => {
        if (width < 1024)
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .first()
            .click();
        await nav.getByRole("button", { name: label, exact: true }).click();
        if (width < 1024)
          await page.locator(".mobile-navigation").waitFor({ state: "hidden" });
      };
      try {
        await page.goto(base);
        await page.locator(".workspace").waitFor();
        await page.evaluate(() => {
          window.routeReviewMount = "retained";
          window.routeReviewWorkspace = document.querySelector(".workspace");
        });
        for (const [label, route] of routes) {
          await select(label);
          await page.waitForURL(base + route);
          assert.equal(
            await page.evaluate(() => window.routeReviewMount),
            "retained",
          );
          assert.equal(
            await page.evaluate(
              () =>
                window.routeReviewWorkspace ===
                document.querySelector(".workspace"),
            ),
            true,
          );
        }
        await page.goBack();
        await page.waitForURL(base + "/artifacts");
        await page.locator(".artifacts-panel").waitFor();
        await page.goForward();
        await page.waitForURL(base + "/trash");
        await page.locator(".trash-panel").waitFor();
        for (const [label, route] of routes) {
          await settle();
          await page.goto(base + route);
          await page.locator(".workspace").waitFor();
          await settle();
          await page.reload();
          await page.locator(".workspace").waitFor();
          assert.equal(new URL(page.url()).pathname, route);
          if (width < 1024)
            await page
              .getByRole("button", { name: "Open navigation", exact: true })
              .first()
              .click();
          assert.equal(
            await nav
              .getByRole("button", { name: label, exact: true })
              .getAttribute("aria-current"),
            "page",
          );
          if (width < 1024) await page.keyboard.press("Escape");
        }
        await settle();
        await page.goto(base + `/?note=${note.id}`);
        const title = page.getByRole("textbox", {
          name: "Note title",
          exact: true,
        });
        await title.waitFor();
        assert.equal(await title.inputValue(), "Route review note");
        await page.waitForURL(base + `/notes?note=${note.id}`);
        await settle();
        await page.reload();
        await title.waitFor();
        assert.equal(await title.inputValue(), "Route review note");
        await settle();
        await page.goto(base + `/favorites?note=${note.id}`);
        await title.waitFor();
        await page.waitForURL(base + `/favorites?note=${note.id}`);
        await settle();
        await page.reload();
        await title.waitFor();
        await page.waitForURL(base + `/favorites?note=${note.id}`);
        if (name === "chromium" && width === 1440) {
          await select("Tasks");
          await select("Notes");
          await page
            .getByRole("button", { name: /Route review note/ })
            .first()
            .click();
          await title.waitFor();
          await page.route(`**/api/nivra/notes/${note.id}`, (route) =>
            route.request().method() === "PATCH"
              ? route.fulfill({
                  status: 503,
                  contentType: "application/json",
                  body: '{"error":"Simulated save failure"}',
                })
              : route.continue(),
          );
          await title.fill("Unsaved route draft");
          await page.locator(".save-error").waitFor();
          await page.goBack();
          await page.waitForURL(base + `/notes?note=${note.id}`);
          assert.equal(await title.inputValue(), "Unsaved route draft");
          await page.unroute(`**/api/nivra/notes/${note.id}`);
          await page
            .getByRole("button", { name: "Try again", exact: true })
            .click();
          await page.locator(".save-status.saved").waitFor();
          const saved = await (
            await api.get(`/api/nivra/notes/${note.id}`)
          ).json();
          await api.patch(`/api/nivra/notes/${note.id}`, {
            data: {
              revision: saved.revision,
              title: "Route review note",
              document: saved.document,
              tags: saved.tags.map((tag) => tag.id),
            },
          });
          guardVerified = true;
        }
        await settle();
        assert.equal(
          (await page.goto(base + "/unknown-workspace-section")).status(),
          404,
        );
        assert.deepEqual(errors, []);
        cases++;
        console.log(
          "Passed",
          name,
          width,
          "section URLs, refresh, direct links, history, retained shell and note links",
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
const anonymous = await request.newContext({ baseURL: base });
for (const [, route] of routes) {
  const response = await anonymous.get(route);
  assert.equal(response.status(), 200);
  assert.equal((await anonymous.get("/api/nivra/notes")).status(), 401);
}
await anonymous.dispose();
await api.dispose();
console.log(
  "Workspace route checks passed",
  cases,
  "browser/viewport cases; private API authorization verified.",
);
if (guardVerified) console.log("Unsaved draft navigation guard verified.");
