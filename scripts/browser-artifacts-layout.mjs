import { chromium, firefox, webkit, request } from "playwright";
import { readFileSync, realpathSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = realpathSync(process.argv[2]);
assert.ok(root.startsWith(path.join(os.tmpdir(), "nivra-artifacts-review-")));
const base = "http://localhost:3004";
const state = path.join(root, "session.json");
const output = ".impeccable/review/artifacts-responsive";
mkdirSync(output, { recursive: true });
const api = await request.newContext({
  baseURL: base,
  storageState: state,
  extraHTTPHeaders: { Origin: base },
});
assert.equal(
  (await (await api.get("/api/nivra/status")).json()).owner?.name,
  "Artifacts Review Owner",
);
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const longName = `document_${"x".repeat(170)}.txt`;
async function clear() {
  for (const item of (
    await (await api.get("/api/nivra/artifacts?limit=100")).json()
  ).items)
    assert.ok(
      (
        await api.delete(`/api/nivra/artifacts/${item.id}`, {
          data: { revision: item.revision },
        })
      ).ok(),
    );
}
async function make(data) {
  const r = await api.post("/api/nivra/artifacts", data);
  assert.ok(r.ok());
  return r.json();
}
async function fit(page, label) {
  const issues = await page.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      problems.push("page overflow");
    for (const selector of [
      ".artifact-viewer",
      ".artifact-grid",
      ".artifact-drop",
      ".artifact-toolbar",
      ".artifact-jobs",
    ]) {
      for (const e of document.querySelectorAll(selector)) {
        const r = e.getBoundingClientRect();
        if (e.scrollWidth > e.clientWidth + 1)
          problems.push(`${selector} internal overflow`);
        if (r.x < -1 || r.right > innerWidth + 1)
          problems.push(`${selector} outside viewport`);
      }
    }
    for (const e of document.querySelectorAll(".artifact-card")) {
      const open = e.querySelector(".artifact-open").getBoundingClientRect();
      const menu = e.querySelector(".artifact-menu").getBoundingClientRect();
      if (menu.top < open.bottom - 1) problems.push("card menu overlap");
    }
    const dialog = document.querySelector(".artifact-viewer");
    if (dialog) {
      const r = dialog.getBoundingClientRect();
      if (r.top < -1 || r.bottom > innerHeight + 1)
        problems.push("viewer outside height");
      const title = dialog.querySelector(".artifact-title"),
        close = dialog.querySelector('[data-slot="dialog-close"]');
      if (
        title &&
        close &&
        title.getBoundingClientRect().right >
          close.getBoundingClientRect().left + 1
      )
        problems.push("title/close overlap");
    }
    return problems;
  });
  assert.deepEqual(issues, [], label);
}
async function axe(page) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(() =>
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
      .then((r) => r.violations.map((v) => `${v.id}: ${v.nodes[0].target}`)),
  );
  assert.deepEqual(result, []);
}
try {
  await clear();
  const text = await make({
    data: {
      text:
        "A saved text artifact\n" +
        "An unbroken content sample " +
        "z".repeat(1500),
    },
  });
  const file = await make({
    multipart: {
      file: {
        name: longName,
        mimeType: "text/plain",
        buffer: Buffer.from("Long filename fixture\n" + "q".repeat(1200)),
      },
    },
  });
  await make({
    multipart: {
      file: {
        name: "Invoice.png",
        mimeType: "image/png",
        buffer: readFileSync("tests/fixtures/ocr-sample.png"),
      },
    },
  });
  const cases = [];
  for (const [engineName, engine] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await engine.launch(
      engineName === "chromium" ? { channel: "chrome" } : {},
    );
    const sizes =
      engineName === "chromium"
        ? [
            [320, 700],
            [390, 844],
            [600, 800],
            [768, 1024],
            [1024, 768],
            [1440, 900],
            [844, 390],
          ]
        : [
            [320, 700],
            [768, 1024],
            [844, 390],
          ];
    try {
      for (const [width, height] of sizes)
        for (const theme of ["light", "dark"]) {
          assert.ok(
            (await api.patch("/api/nivra/settings", { data: { theme } })).ok(),
          );
          const context = await browser.newContext({
            storageState: state,
            viewport: { width, height },
            isMobile: width < 768,
            hasTouch: width < 1025,
            serviceWorkers: "block",
          });
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          try {
            await page.goto(base);
            await page.locator(".workspace").waitFor();
            await page
              .getByRole("button", { name: "Open navigation", exact: true })
              .first()
              .isVisible()
              .then(async (visible) => {
                if (visible)
                  await page
                    .getByRole("button", {
                      name: "Open navigation",
                      exact: true,
                    })
                    .first()
                    .click();
              });
            await page
              .getByRole("button", { name: "Artifacts", exact: true })
              .click();
            await page.locator(".artifact-card").first().waitFor();
            await fit(page, `${engineName} ${width} ${theme} grid`);
            await axe(page);
            if (width < 768) {
              const select = page.getByRole("combobox", {
                name: "Artifact type",
              });
              await select.click();
              await page.getByRole("option", { name: /^Files/ }).click();
              await page.waitForFunction(
                () => document.querySelectorAll(".artifact-card").length === 1,
              );
              await select.click();
              await page.getByRole("option", { name: /^All/ }).click();
              await page.waitForFunction(
                () => document.querySelectorAll(".artifact-card").length === 3,
              );
            }
            await page.screenshot({
              path: `${output}/${engineName}-${width}-${height}-${theme}-grid.png`,
            });
            await page
              .getByRole("button", { name: `Open ${file.title}`, exact: true })
              .click();
            await page
              .getByRole("textbox", { name: "Title", exact: true })
              .waitFor();
            await fit(page, `${engineName} ${width} ${theme} viewer`);
            await axe(page);
            await page.screenshot({
              path: `${output}/${engineName}-${width}-${height}-${theme}-viewer.png`,
            });
            await page.keyboard.press("Escape");
            await page.locator(".artifact-viewer").waitFor({ state: "hidden" });
            if (
              engineName === "chromium" &&
              width === 320 &&
              theme === "dark"
            ) {
              const changedTitle =
                "A renamed artifact with a long but readable title";
              await page
                .getByRole("button", {
                  name: `Open ${text.title}`,
                  exact: true,
                })
                .click();
              await page
                .getByLabel("Title", { exact: true })
                .fill(changedTitle);
              await page.getByLabel("Title", { exact: true }).press("Enter");
              await page.waitForFunction(
                () => !document.querySelector(".artifact-title")?.disabled,
              );
              await page.keyboard.press("Escape");
              await page
                .getByRole("button", {
                  name: `Open ${changedTitle}`,
                  exact: true,
                })
                .waitFor();
              assert.equal(
                await page
                  .locator(".artifact-card-title")
                  .filter({ hasText: changedTitle })
                  .count(),
                1,
              );
              await page
                .getByRole("button", {
                  name: `Open ${changedTitle}`,
                  exact: true,
                })
                .click();
              await page
                .getByRole("button", { name: "Delete", exact: true })
                .click();
              await page
                .getByRole("button", { name: "Delete artifact", exact: true })
                .click();
              await page
                .locator(".artifact-viewer")
                .waitFor({ state: "hidden" });
              await page
                .getByRole("button", {
                  name: `Open ${file.title}`,
                  exact: true,
                })
                .click();
              await page.getByLabel("Title", { exact: true }).waitFor();
              assert.ok(
                await page.getByLabel("Title", { exact: true }).isEnabled(),
              );
              await page.keyboard.press("Escape");
              await page
                .locator(".artifact-viewer")
                .waitFor({ state: "hidden" });
              const recreated = await make({
                data: {
                  text:
                    "A saved text artifact\n" +
                    "An unbroken content sample " +
                    "z".repeat(1500),
                },
              });
              text.id = recreated.id;
              await page
                .getByRole("button", { name: "Refresh artifacts", exact: true })
                .click();
              await page.route("**/api/nivra/artifacts", (route) =>
                route.request().method() === "POST"
                  ? route.fulfill({
                      status: 503,
                      json: {
                        error:
                          "Upload could not finish. Retry when the connection is available.",
                      },
                    })
                  : route.continue(),
              );
              await page.locator('input[type="file"]').setInputFiles({
                name: longName,
                mimeType: "text/plain",
                buffer: Buffer.from("Failed upload fixture"),
              });
              await page
                .getByRole("button", { name: "Retry", exact: true })
                .waitFor();
              await fit(page, "failed upload row");
              await axe(page);
              await page.locator(".tasks-scroll").evaluate((element) => {
                element.scrollTop = 0;
              });
              await page
                .locator(".artifact-jobs .has-error")
                .first()
                .scrollIntoViewIfNeeded();
              await page.screenshot({
                path: `${output}/chromium-320-dark-error.png`,
              });
              await page.unroute("**/api/nivra/artifacts");
              await page
                .getByRole("button", { name: "Retry", exact: true })
                .click();
              await page.locator(".artifact-jobs").waitFor({ state: "hidden" });
              const items = (
                await (await api.get("/api/nivra/artifacts?limit=100")).json()
              ).items;
              const retry = items.find(
                (i) => i.id !== file.id && i.name === longName,
              );
              assert.ok(retry);
              await api.delete(`/api/nivra/artifacts/${retry.id}`, {
                data: { revision: retry.revision },
              });
            }
            assert.deepEqual(errors, []);
            cases.push({ engine: engineName, width, height, theme });
            console.log(
              `${engineName} ${width}x${height} ${theme}: layout, long names, filters, accessibility passed`,
            );
          } finally {
            await context.close();
          }
        }
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify(cases));
} finally {
  await clear();
  await api.dispose();
}
