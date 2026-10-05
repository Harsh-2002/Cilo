import { chromium, firefox, webkit, devices, request } from "playwright";
import { readFileSync, realpathSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const root = realpathSync(process.argv[2]);
assert.ok(
  root.startsWith(path.join(tmpdir(), "cilo-artifacts-review-")),
  "Disposable review directory required.",
);
const base = "http://localhost:3004";
const state = path.join(root, "session.json");
const sample = readFileSync(
  new URL("../tests/fixtures/ocr-sample.png", import.meta.url),
);
const axeSource = readFileSync(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
mkdirSync(".impeccable/review", { recursive: true });
const engines = process.argv.slice(3).filter((v) => !v.startsWith("--"));
const mediaFixtures = [
  ["wav", "audio", "audio/wav"],
  ["mp3", "audio", "audio/mpeg"],
  ["m4a", "audio", "audio/mp4"],
  ["ogg", "audio", "audio/ogg"],
  ["flac", "audio", "audio/flac"],
  ["mp4", "video", "video/mp4"],
  ["webm", "video", "video/webm"],
].filter(
  ([fixture]) =>
    !process.argv.includes("--layout-review") ||
    fixture === "flac" ||
    fixture === "webm",
);

async function owner() {
  const api = await request.newContext({
    baseURL: base,
    storageState: state,
    extraHTTPHeaders: { Origin: base },
  });
  const status = await (await api.get("/api/nivra/status")).json();
  assert.equal(
    status.owner?.name,
    "Artifacts Review Owner",
    "Disposable owner required.",
  );
  return api;
}
async function clean(api) {
  const page = await (await api.get("/api/nivra/artifacts?limit=100")).json();
  for (const item of page.items)
    await api.delete(`/api/nivra/artifacts/${item.id}`, {
      data: { revision: item.revision },
    });
}
async function openSection(page, name, mobile) {
  if (mobile) {
    await page
      .getByRole("button", { name: "Open navigation" })
      .first()
      [mobile ? "tap" : "click"]();
    await page
      .getByRole("button", { name, exact: true })
      .first()
      .waitFor({ state: "visible" });
    await page.waitForTimeout(350);
  }
  await page
    .getByRole("button", { name, exact: true })
    .first()
    [mobile ? "tap" : "click"]();
  if (mobile)
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
}
async function axe(page, label) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(() =>
    window.axe
      .run(document, {
        runOnly: {
          type: "tag",
          values: [
            "wcag2a",
            "wcag2aa",
            "wcag21aa",
            "wcag22aa",
            "best-practice",
          ],
        },
      })
      .then((r) =>
        r.violations.map(
          (v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(" ")}`,
        ),
      ),
  );
  assert.deepEqual(violations, [], `axe ${label}`);
}
const overflow = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

const results = [];
for (const [engineName, engine] of Object.entries({
  chromium,
  firefox,
  webkit,
})) {
  if (engines.length && !engines.includes(engineName)) continue;
  for (const profile of process.argv.includes("--phone")
    ? ["phone"]
    : ["desktop", "phone"]) {
    const api = await owner();
    await clean(api);
    const theme = profile === "desktop" ? "light" : "dark";
    assert.ok(
      (await api.patch("/api/nivra/settings", { data: { theme } })).ok(),
    );
    const browser = await engine.launch(
      engineName === "chromium" ? { channel: "chrome" } : {},
    );
    const options =
      profile === "desktop"
        ? { viewport: { width: 1440, height: 900 } }
        : { ...devices[engineName === "chromium" ? "Pixel 7" : "iPhone 13"] };
    const context = await browser.newContext({
      ...options,
      storageState: state,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    let quiet = 0;
    page.on("pageerror", (e) => {
      if (
        Date.now() < quiet &&
        e.message.endsWith("due to access control checks.")
      )
        return;
      errors.push(e.message);
    });
    const mobile = profile === "phone";
    const unique = `${engineName}-${profile}-${Date.now().toString(36)}`;
    try {
      quiet = Infinity;
      await page.goto(base);
      quiet = Date.now() + 600;
      await page.waitForTimeout(2000);
      await openSection(page, "Artifacts", mobile);
      await page.getByRole("heading", { name: "Nothing saved yet." }).waitFor();
      await axe(page, "empty");

      // Upload a screenshot and wait for its text to be read.
      await page.locator('input[type="file"]').setInputFiles({
        name: "Screenshot invoice.png",
        mimeType: "image/png",
        buffer: sample,
      });
      const card = page.locator(".artifact-card.is-image").first();
      await card.waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".artifact-status"),
        null,
        { timeout: 60000 },
      );
      const listed = await (
        await api.get("/api/nivra/artifacts?limit=10")
      ).json();
      assert.equal(listed.items[0].extraction, "done");
      assert.match(
        (
          await (
            await api.get(`/api/nivra/artifacts/${listed.items[0].id}`)
          ).json()
        ).content,
        /Northwind Traders/,
      );

      // Text artifact through the composer.
      await page
        .getByRole("button", { name: "Add text" })
        [mobile ? "tap" : "click"]();
      await page
        .getByLabel("Text to save")
        .fill(
          `Garden notes ${unique}\nPlant the tulips before the first frost`,
        );
      await page
        .getByRole("button", { name: "Save", exact: true })
        [mobile ? "tap" : "click"]();
      await page.locator(".artifact-card.is-text").first().waitFor();
      assert.match(
        await page.locator(".artifact-card.is-text").first().innerText(),
        /Garden notes/,
      );

      // Search inside the image and inside the text.
      const search = page.getByLabel("Search artifacts");
      await search.fill("northwind");
      await page.waitForFunction(
        () => document.querySelectorAll(".artifact-card").length === 1,
      );
      assert.equal(
        (
          await page.locator(".artifact-hit mark").first().innerText()
        ).toLowerCase(),
        "northwind",
      );
      await search.fill("northwnd");
      await page.waitForFunction(
        () => document.querySelectorAll(".artifact-card").length === 1,
      );
      await search.fill("tulips");
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".artifact-card.is-text").length === 1 &&
          document.querySelectorAll(".artifact-card").length === 1,
      );
      await search.fill("zzzznothing");
      await page.getByRole("heading", { name: "No matches." }).waitFor();
      await search.fill("");
      await page.waitForFunction(
        () => document.querySelectorAll(".artifact-card").length === 2,
      );
      await page
        .getByRole("button", { name: /^Images/ })
        [mobile ? "tap" : "click"]();
      await page.waitForFunction(
        () => document.querySelectorAll(".artifact-card").length === 1,
      );
      await page
        .getByRole("button", { name: /^All/ })
        [mobile ? "tap" : "click"]();
      await page.waitForFunction(
        () => document.querySelectorAll(".artifact-card").length === 2,
      );

      // Paste and drop, where the engine supports synthetic clipboard transfers.
      const synthetic = await page.evaluate(
        async (bytes) => {
          try {
            const file = new File([new Uint8Array(bytes)], "Pasted image.png", {
              type: "image/png",
            });
            const data = new DataTransfer();
            data.items.add(file);
            const paste = new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            });
            document.body.dispatchEvent(paste);
            const drop = new DataTransfer();
            drop.setData("text/plain", "Dropped snippet");
            const section = document.querySelector(".artifacts-panel");
            section.dispatchEvent(
              new DragEvent("drop", {
                dataTransfer: drop,
                bubbles: true,
                cancelable: true,
              }),
            );
            return paste.clipboardData?.files.length === 1;
          } catch {
            return false;
          }
        },
        [...sample],
      );
      if (synthetic) {
        await page.waitForFunction(
          () => document.querySelectorAll(".artifact-card").length === 4,
          null,
          { timeout: 30000 },
        );
        assert.match(
          await page.locator(".artifacts-panel").innerText(),
          /Dropped snippet/,
        );
      }
      await page.waitForFunction(
        () => !document.querySelector(".artifact-status"),
        null,
        { timeout: 90000 },
      );

      // Global search finds the screenshot by its text and opens the viewer.
      if (mobile) {
        await page
          .getByRole("button", { name: "Open navigation" })
          .first()
          [mobile ? "tap" : "click"]();
        await page
          .getByRole("button", { name: "Search", exact: true })
          [mobile ? "tap" : "click"]();
      } else await page.keyboard.press("Control+k");
      await page.getByRole("dialog").getByRole("combobox").fill("northwind");
      const hit = page
        .getByRole("dialog")
        .getByRole("option")
        .filter({ hasText: "Artifact" })
        .first();
      await hit.waitFor();
      await hit[mobile ? "tap" : "click"]();
      const viewer = page.locator(".artifact-viewer");
      await viewer.waitFor();
      await viewer.locator(".artifact-viewer-image img").waitFor();
      assert.match(
        await viewer.locator(".artifact-text").innerText(),
        /Quarterly invoice 4821/,
      );
      await axe(page, "viewer");
      assert.equal(await overflow(page), 0, "viewer overflow");
      await page.screenshot({
        path: `.impeccable/review/artifacts-${engineName}-${profile}-viewer.png`,
      });

      // Rename, then delete through the confirmation dialog.
      const title = viewer.getByLabel("Title");
      await title.fill("Invoice scan");
      await title.press("Enter");
      await page.waitForFunction(() => {
        const input = document.querySelector(
          ".artifact-viewer input[aria-label=Title]",
        );
        return input?.value === "Invoice scan" && !input.disabled;
      });
      await page.keyboard.press("Escape");
      await viewer.waitFor({ state: "hidden" });
      assert.match(
        await page.locator(".artifact-card.is-image").first().innerText(),
        /Invoice scan/,
      );
      assert.deepEqual(
        await page.locator(".artifact-card").evaluateAll((cards) =>
          cards.flatMap((card) => {
            const preview = card.querySelector(".artifact-open");
            const menu = card.querySelector(".artifact-menu");
            if (!preview || !menu) return ["Missing card control"];
            return menu.getBoundingClientRect().top <
              preview.getBoundingClientRect().bottom - 1
              ? [preview.getAttribute("aria-label")]
              : [];
          }),
        ),
        [],
        "Card actions must not overlap previews or text",
      );
      await page.screenshot({
        path: `.impeccable/review/artifacts-${engineName}-${profile}-grid.png`,
      });
      assert.equal(await overflow(page), 0, "grid overflow");
      await axe(page, "grid");
      const before = await page.locator(".artifact-card").count();
      await page
        .getByRole("button", { name: /^Actions for Invoice scan/ })
        .first()
        [mobile ? "tap" : "click"]();
      await page
        .getByRole("menuitem", { name: "Delete" })
        [mobile ? "tap" : "click"]();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete artifact" })
        [mobile ? "tap" : "click"]();
      await page.waitForFunction(
        (n) => document.querySelectorAll(".artifact-card").length === n,
        before - 1,
      );
      const summary = await (
        await api.get("/api/nivra/artifacts?summary=1")
      ).json();
      assert.equal(summary.total, before - 1);
      await page
        .getByRole("button", { name: /^Open Garden notes/ })
        .first()
        [mobile ? "tap" : "click"]();
      await viewer.getByLabel("Text", { exact: true }).fill("An unsaved draft");
      await page.keyboard.press("Escape");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Cancel", exact: true })
        [mobile ? "tap" : "click"]();
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Text",
      );
      assert.equal(
        await viewer.getByLabel("Text", { exact: true }).inputValue(),
        "An unsaved draft",
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Discard changes", exact: true })
        [mobile ? "tap" : "click"]();
      await viewer.waitFor({ state: "hidden" });
      for (const [fixture, kind, mime] of mediaFixtures) {
        await page.locator('input[type="file"]').setInputFiles({
          name: `Sample.${fixture}`,
          mimeType: mime,
          buffer: readFileSync(
            new URL(`../tests/fixtures/sample.${fixture}`, import.meta.url),
          ),
        });
        const mediaCard = page
          .locator(".artifact-card")
          .filter({ hasText: `Sample.${fixture}` })
          .first();
        await mediaCard.waitFor();
        await mediaCard.locator(".artifact-open")[mobile ? "tap" : "click"]();
        await viewer.waitFor();
        await page
          .getByRole("button", { name: `Play ${kind}`, exact: true })
          [mobile ? "tap" : "click"]();
        await page.waitForFunction((kind) => {
          const media = document.querySelector(`.artifact-viewer ${kind}`);
          return media && !media.paused && media.currentTime > 0;
        }, kind);
        await page
          .getByRole("button", { name: `Pause ${kind}`, exact: true })
          [mobile ? "tap" : "click"]();
        await axe(page, `${kind} viewer`);
        assert.equal(await overflow(page), 0);
        await page.screenshot({
          path: `.impeccable/review/artifacts-${engineName}-${profile}-${kind}.png`,
        });
        await page.keyboard.press("Escape");
        await viewer.waitFor({ state: "hidden" });
      }
      assert.deepEqual(errors, []);
      results.push({ engineName, profile, theme, pasteAndDrop: synthetic });
      console.log(
        `${engineName} ${profile}: OCR, search, viewer, clipboard/drop, deletion, draft guard, card layout and ${mediaFixtures.length} media fixtures passed.`,
      );
    } catch (error) {
      await page
        .screenshot({
          path: `.impeccable/review/artifacts-${engineName}-${profile}-failure.png`,
        })
        .catch(() => {});
      console.error(
        engineName,
        profile,
        await page
          .evaluate(() => ({
            dialogs: [
              ...document.querySelectorAll(
                '[role="dialog"],[role="alertdialog"],[role="menu"]',
              ),
            ].map((n) => ({
              role: n.getAttribute("role"),
              text: n.textContent?.slice(0, 160),
            })),
            active: document.activeElement?.outerHTML.slice(0, 200),
          }))
          .catch(() => ({})),
      );
      throw error;
    } finally {
      await clean(api);
      await api.dispose();
      await browser.close();
    }
  }
}
console.log(JSON.stringify(results, null, 2));
