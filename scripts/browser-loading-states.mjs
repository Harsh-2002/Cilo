import { chromium, firefox, webkit, request } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = realpathSync(process.argv[2]);
assert.ok(root.startsWith("/tmp/nivra-layout-review-"));
const base = "http://localhost:3004",
  output = path.join(root, "loading-review");
mkdirSync(output, { recursive: true });
const api = await request.newContext({
  baseURL: base,
  storageState: path.join(root, "session.json"),
  extraHTTPHeaders: { Origin: base },
});
assert.equal(
  (await (await api.get("/api/nivra/status")).json()).owner?.name,
  "Layout Review Owner",
);
const artifact = (
  await (await api.get("/api/nivra/artifacts?limit=100")).json()
).items.find((item) => item.name === "Field-notes.txt");
assert.ok(artifact);
const sections = [
  ["Overview", "overview", "Loading your overview"],
  ["Notes", "notes", "Loading notes"],
  ["Favorites", "notes", "Loading favorites"],
  ["Journal", "notes", "Loading journal entries"],
  ["Tasks", "tasks", "Loading tasks"],
  ["Bookmarks", "bookmarks", "Loading bookmarks"],
  ["Artifacts", "artifacts", "Loading artifacts"],
  ["Trash", "trash", "Loading deleted items"],
];
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const reports = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  if (process.argv[3] && name !== process.argv[3]) continue;
  const browser = await engine.launch(
    name === "chromium" ? { channel: "chrome" } : {},
  );
  try {
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ].filter(
      ([width]) => !process.argv[4] || width === Number(process.argv[4]),
    ))
      for (const theme of ["light", "dark"].filter(
        (theme) => !process.argv[5] || theme === process.argv[5],
      )) {
        const context = await browser.newContext({
          storageState: path.join(root, "session.json"),
          viewport: { width, height },
          colorScheme: theme,
          hasTouch: width < 1024,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.addInitScript(
          (theme) => localStorage.setItem("nivra-theme", theme),
          theme,
        );
        const held = new Set(sections.map(([section]) => section)),
          pending = new Map();
        let hits = 0;
        const release = (section) => {
          held.delete(section);
          for (const done of pending.get(section) || []) done();
          pending.delete(section);
        };
        const key = (request) => {
          const url = new URL(request.url()),
            parts = url.pathname.split("/").filter(Boolean);
          if (
            request.method() !== "GET" ||
            parts[0] !== "api" ||
            parts[1] !== "nivra"
          )
            return null;
          if (parts[2] === "search") return "Search";
          if (
            parts[2] === "artifacts" &&
            parts[3] === artifact.id &&
            parts.length === 4
          )
            return "Viewer";
          if (parts.length !== 3) return null;
          if (parts[2] === "notes") {
            return (
              {
                overview: "Overview",
                all: "Notes",
                favorites: "Favorites",
                journal: "Journal",
                trash: "Trash",
              }[url.searchParams.get("view")] || "Notes"
            );
          }
          return sections.find(([, area]) => area === parts[2])?.[0];
        };
        await page.route("**/api/nivra/**", async (route) => {
          const section = key(route.request());
          if (held.has(section)) {
            hits++;
            await new Promise((done) =>
              pending.set(section, [...(pending.get(section) || []), done]),
            );
          }
          await route.continue().catch(() => {});
        });
        const label = `${name}-${width}-${theme}`,
          errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          await page.goto(base, { waitUntil: "domcontentloaded" });
          await page.locator(".workspace").waitFor();
          for (const [section, , loadingLabel] of sections) {
            if (section !== "Overview") {
              if (width < 1024)
                await page
                  .getByRole("button", { name: "Open navigation", exact: true })
                  .first()
                  .click();
              await page
                .getByRole("button", { name: section, exact: true })
                .first()
                .click();
              if (width < 1024)
                await page
                  .locator(".mobile-navigation")
                  .waitFor({ state: "hidden" });
            }
            const loader = page.getByRole("status", {
              name: loadingLabel,
              exact: true,
            });
            await loader.waitFor();
            if (section === "Artifacts") {
              assert.equal(
                await loader.getAttribute("class"),
                width < 768
                  ? "loading-state loading-artifact-list"
                  : "loading-state loading-gallery",
              );
              await page
                .getByRole("button", {
                  name: width < 768 ? "Grid view" : "List view",
                  exact: true,
                })
                .click();
              await page
                .locator(
                  width < 768 ? ".loading-gallery" : ".loading-artifact-list",
                )
                .waitFor();
              await page
                .getByRole("button", {
                  name: width < 768 ? "List view" : "Grid view",
                  exact: true,
                })
                .click();
            }
            const metrics = await loader.evaluate((element) => ({
              busy: element.getAttribute("aria-busy"),
              bars: element.querySelectorAll(".loading-bar").length,
              animation: getComputedStyle(
                element.querySelector(".loading-bar"),
                "::after",
              ).animationName,
              overflow: element.scrollWidth > element.clientWidth + 1,
              pageOverflow: document.documentElement.scrollWidth > innerWidth,
            }));
            assert.equal(metrics.busy, "true");
            assert.ok(metrics.bars >= 6);
            assert.equal(metrics.animation, "loading-sweep");
            assert.equal(metrics.overflow, false);
            assert.equal(metrics.pageOverflow, false);
            await page.emulateMedia({ reducedMotion: "reduce" });
            assert.equal(
              await loader
                .locator(".loading-bar")
                .first()
                .evaluate(
                  (element) =>
                    getComputedStyle(element, "::after").animationName,
                ),
              "none",
            );
            await page.emulateMedia({ reducedMotion: "no-preference" });
            if (name === "chromium")
              await page.screenshot({
                path: path.join(
                  output,
                  `${label}-${section.toLowerCase()}.png`,
                ),
              });
            release(section);
            await loader.waitFor({ state: "hidden" });
            await page.waitForTimeout(100);
            if (
              ["Overview", "Tasks", "Bookmarks", "Artifacts"].includes(section)
            ) {
              held.add(section);
              const before = hits;
              await page.evaluate(() =>
                window.dispatchEvent(
                  new CustomEvent("nivra:completion", {
                    detail: { reason: "resync" },
                  }),
                ),
              );
              await page.waitForFunction(() =>
                document.querySelector(".section-content"),
              );
              for (let attempt = 0; hits === before && attempt < 30; attempt++)
                await page.waitForTimeout(50);
              assert.ok(hits > before);
              assert.equal(
                await loader.count(),
                0,
                `${label} ${section} replaces loaded content during refresh`,
              );
              release(section);
            }
            reports.push({ label, section, ...metrics });
          }
          if (width < 1024)
            await page
              .getByRole("button", { name: "Open navigation", exact: true })
              .first()
              .click();
          await page
            .getByRole("button", { name: "Artifacts", exact: true })
            .first()
            .click();
          held.add("Viewer");
          await page
            .getByRole("button", { name: "Open Field-notes.txt", exact: true })
            .click();
          const viewerLoader = page.getByRole("status", {
            name: "Loading artifact",
            exact: true,
          });
          await viewerLoader.waitFor();
          assert.ok(await viewerLoader.locator(".loading-bar").count());
          release("Viewer");
          await viewerLoader.waitFor({ state: "hidden" });
          await page
            .locator(".artifact-viewer")
            .getByRole("button", { name: "Close", exact: true })
            .click();
          held.add("Search");
          await page.keyboard.press("Control+k");
          const searchLoader = page.getByRole("status", {
            name: "Loading search results",
            exact: true,
          });
          await searchLoader.waitFor();
          await page.addScriptTag({ content: axe });
          const pendingViolations = await page.evaluate(async () =>
            (await window.axe.run(document)).violations
              .filter((item) => ["serious", "critical"].includes(item.impact))
              .map((item) => ({
                id: item.id,
                targets: item.nodes.map((node) => node.target),
              })),
          );
          assert.deepEqual(pendingViolations, []);
          release("Search");
          await searchLoader.waitFor({ state: "hidden" });
          await page.keyboard.press("Escape");
          await page
            .getByRole("dialog", { name: "Search Nivra", exact: true })
            .waitFor({ state: "hidden" });
          const violations = await page.evaluate(async () =>
            (await window.axe.run(document)).violations
              .filter((item) => ["serious", "critical"].includes(item.impact))
              .map((item) => ({
                id: item.id,
                nodes: item.nodes.map((node) => ({
                  target: node.target,
                  html: node.html,
                })),
              })),
          );
          assert.deepEqual(violations, []);
          assert.deepEqual(errors, []);
          console.log(
            "Passed",
            label,
            "all eight sections, refresh preservation, viewer, search and reduced motion",
          );
        } finally {
          for (const section of held) release(section);
          await context.close();
        }
      }
  } finally {
    await browser.close();
  }
}
writeFileSync(
  path.join(output, "report.json"),
  JSON.stringify(reports, null, 2),
);
await api.dispose();
console.log(
  `Loading checks passed ${reports.length} section states across ${reports.length / sections.length} viewport/theme cases.`,
);
