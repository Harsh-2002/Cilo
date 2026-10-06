import { chromium, firefox, webkit, request } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";

const root = realpathSync(process.argv[2]);
assert.ok(root.startsWith("/tmp/nivra-layout-review-"));
const base = "http://localhost:3004";
const output = path.join(root, "gallery-review");
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
await api.patch("/api/nivra/settings", { data: { theme: "system" } });
for (const item of (
  await (await api.get("/api/nivra/artifacts?limit=100")).json()
).items) {
  assert.ok(
    (
      await api.delete(`/api/nivra/artifacts/${item.id}`, {
        data: { revision: item.revision },
      })
    ).ok(),
  );
}
const items = [];
async function create(options) {
  const response = await api.post("/api/nivra/artifacts", options);
  assert.ok(response.ok());
  const item = await response.json();
  items.push(item);
  return item;
}
for (const [name, width, height] of [
  ["Portrait.png", 320, 720],
  ["Landscape.png", 900, 240],
  ["Square.png", 480, 480],
]) {
  await create({
    multipart: {
      file: {
        name,
        mimeType: "image/png",
        buffer: await sharp("tests/fixtures/ocr-sample.png")
          .resize(width, height, { fit: "contain", background: "white" })
          .png()
          .toBuffer(),
      },
    },
  });
}
const hidden =
  "Hiddenindexword2026 This processed text belongs inside the viewer.";
const file = await create({
  multipart: {
    file: {
      name: "Field-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(hidden),
    },
  },
});
const longName = "a-very-long-filename-" + "x".repeat(145) + ".txt";
await create({
  multipart: {
    file: {
      name: longName,
      mimeType: "text/plain",
      buffer: Buffer.from("Another private extracted body"),
    },
  },
});
const text = await create({
  data: { text: "Memo\nA saved text body that stays out of the card." },
});
const renamed = await api.patch(`/api/nivra/artifacts/${text.id}`, {
  data: { revision: text.revision, title: "The memo" },
});
assert.ok(renamed.ok());
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  const item = await (await api.get(`/api/nivra/artifacts/${file.id}`)).json();
  if (item.extraction === "done") {
    assert.ok(item.content.includes(hidden));
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}
assert.ok(
  (
    await (await api.get("/api/nivra/artifacts?q=Hiddenindexword2026")).json()
  ).items.some((item) => item.id === file.id),
);
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const reports = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch(
    name === "chromium" ? { channel: "chrome" } : {},
  );
  try {
    const sizes =
      name === "chromium"
        ? [
            [320, 700],
            [390, 844],
            [768, 1024],
            [1024, 768],
            [1440, 900],
            [844, 390],
          ]
        : [
            [390, 844],
            [1440, 900],
          ];
    for (const [width, height] of sizes)
      for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({
          storageState: path.join(root, "session.json"),
          viewport: { width, height },
          colorScheme: theme,
          hasTouch: width < 1024,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript(
          (theme) => localStorage.setItem("nivra-theme", theme),
          theme,
        );
        const label = `${name}-${width}-${height}-${theme}`;
        try {
          await page.goto(base);
          await page.locator(".workspace").waitFor();
          const openNavigation = async () => {
            if (width < 1024)
              await page
                .getByRole("button", { name: "Open navigation", exact: true })
                .first()
                .click();
          };
          await openNavigation();
          const sidebar = page.locator(
            width < 1024 ? ".mobile-navigation" : ".desktop-navigation",
          );
          assert.equal(
            await sidebar.getByRole("button", { name: /^Capture/ }).count(),
            0,
          );
          const quick = sidebar.getByRole("button", { name: /^Quick/ });
          assert.equal(await quick.locator("svg.lucide-zap").count(), 1);
          await quick.click();
          const dialog = page.getByRole("dialog", {
            name: "Quick",
            exact: true,
          });
          await dialog.waitFor();
          const input = dialog.getByRole("textbox", {
            name: "Quick text",
            exact: true,
          });
          await input.fill("Unsaved quick draft");
          await page.keyboard.press("Escape");
          await openNavigation();
          await sidebar.getByRole("button", { name: /^Quick/ }).click();
          assert.equal(await input.inputValue(), "Unsaved quick draft");
          await input.fill("");
          await page.keyboard.press("Escape");
          await openNavigation();
          await sidebar
            .getByRole("button", { name: "Artifacts", exact: true })
            .click();
          await page.locator('.artifact-grid[data-measured="true"]').waitFor();
          await page.waitForFunction(
            () =>
              document.querySelectorAll(".artifact-thumb img").length === 3 &&
              [...document.querySelectorAll(".artifact-thumb img")].every(
                (image) => image.complete && image.naturalWidth,
              ),
          );
          await page.waitForTimeout(150);
          await page.keyboard.press("Tab");
          await page.locator(".artifact-open").first().focus();
          const focus = await page
            .locator(".artifact-open")
            .first()
            .evaluate((element) => ({
              offset: getComputedStyle(element).outlineOffset,
              width: getComputedStyle(element).outlineWidth,
            }));
          assert.equal(focus.offset, "-3px");
          assert.equal(focus.width, "2px");
          await page
            .locator(".artifact-open")
            .first()
            .evaluate((element) => element.blur());
          const geometry = await page.evaluate(() => {
            const cards = [...document.querySelectorAll(".artifact-card")].map(
              (card) => {
                const r = card.getBoundingClientRect(),
                  title = card
                    .querySelector(".artifact-card-title")
                    .getBoundingClientRect(),
                  menu = card
                    .querySelector(".artifact-menu")
                    .getBoundingClientRect();
                return {
                  x: r.x,
                  y: r.y,
                  right: r.right,
                  bottom: r.bottom,
                  height: r.height,
                  text: card.innerText,
                  label: card.querySelector(".artifact-card-title").textContent,
                  menuHeight: menu.height,
                  labelFits: title.right <= menu.x + 1,
                  overflow: card.scrollWidth > card.clientWidth + 1,
                };
              },
            );
            const overlaps = cards.some((a, i) =>
              cards
                .slice(i + 1)
                .some(
                  (b) =>
                    Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                    Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
                ),
            );
            return {
              cards,
              overlaps,
              overflow: document.documentElement.scrollWidth > innerWidth,
              columns: getComputedStyle(
                document.querySelector(".artifact-grid"),
              ).gridTemplateColumns.split(" ").length,
              snippets: document.querySelectorAll(
                ".artifact-snippet,.artifact-hit,.artifact-status,.artifact-card-name",
              ).length,
            };
          });
          assert.equal(geometry.cards.length, 6);
          assert.equal(geometry.overlaps, false);
          assert.equal(geometry.overflow, false);
          assert.equal(geometry.snippets, 0);
          assert.ok(
            geometry.cards.every(
              (card) =>
                card.labelFits && !card.overflow && card.menuHeight === 44,
            ),
          );
          assert.ok(
            geometry.cards.every(
              (card) => card.text.trim() === card.label.trim(),
            ),
          );
          assert.ok(
            Math.max(...geometry.cards.map((card) => card.height)) -
              Math.min(...geometry.cards.map((card) => card.height)) >
              100,
          );
          await page.screenshot({
            path: path.join(output, label + ".png"),
            fullPage: true,
          });
          const search = page.getByRole("textbox", {
            name: "Search artifacts",
            exact: true,
          });
          await search.fill("Hiddenindexword2026");
          await page.waitForFunction(
            () => document.querySelectorAll(".artifact-card").length === 1,
          );
          assert.equal(
            (await page.locator(".artifact-card").innerText()).trim(),
            "Field-notes.txt",
          );
          assert.equal(await page.locator(".artifact-hit").count(), 0);
          await page
            .getByRole("button", { name: "Open Field-notes.txt", exact: true })
            .click();
          const viewer = page.locator(".artifact-viewer");
          await viewer.waitFor();
          await page.waitForFunction(() =>
            document
              .querySelector(".artifact-text")
              ?.textContent?.includes("Hiddenindexword2026"),
          );
          assert.ok(
            (await viewer.locator(".artifact-meta").innerText()).includes(
              "Field-notes.txt",
            ),
          );
          await viewer
            .getByRole("button", { name: "Close", exact: true })
            .click();
          await search.fill("");
          await page.waitForFunction(
            () => document.querySelectorAll(".artifact-card").length === 6,
          );
          await page.addScriptTag({ content: axe });
          const violations = await page.evaluate(async () =>
            (await window.axe.run(document)).violations
              .filter((v) => ["serious", "critical"].includes(v.impact))
              .map((v) => v.id),
          );
          assert.deepEqual(violations, []);
          assert.deepEqual(errors, []);
          reports.push({ label, ...geometry });
          console.log("Passed", label);
        } finally {
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
  `Gallery and Quick checks passed ${reports.length} viewport/theme cases.`,
);
