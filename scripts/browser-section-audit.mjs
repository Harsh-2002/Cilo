import { chromium, firefox, webkit, request } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const root = realpathSync(process.argv[2]);
assert.ok(
  root.startsWith("/tmp/nivra-layout-review-"),
  "Disposable data required",
);
const base = "http://localhost:3004";
const output = path.join(root, "section-audit");
mkdirSync(output, { recursive: true });
const api = await request.newContext({
  baseURL: base,
  storageState: path.join(root, "session.json"),
  extraHTTPHeaders: { Origin: base },
});
assert.equal(
  (await (await api.get("/api/v1/status")).json()).owner?.name,
  "Layout Review Owner",
);
assert.ok(
  (await api.patch("/api/v1/settings", { data: { theme: "system" } })).ok(),
);
const seeds = [];
async function value(response) {
  assert.ok(response.ok(), await response.text());
  return response.json();
}
for (const [kind, route, data] of [
  ["note", "notes", { title: "Audit deleted note" }],
  [
    "journal",
    "journals",
    {
      date: new Date(
        Date.UTC(2035, 0, 1) + Math.floor(Math.random() * 3650) * 86400000,
      )
        .toISOString()
        .slice(0, 10),
    },
  ],
  ["task", "tasks", { title: "Audit deleted task" }],
  ["bookmark", "bookmarks", { url: `http://127.0.0.1/audit-${randomUUID()}` }],
  ["artifact", "artifacts", { text: "Audit deleted artifact" }],
]) {
  const item = await value(await api.post(`/api/v1/${route}`, { data }));
  seeds.push({ kind, id: item.id });
  if (kind === "note" || kind === "journal")
    await value(
      await api.patch(`/api/v1/notes/${item.id}`, {
        data: { revision: item.revision, trashed: true },
      }),
    );
  else
    await value(
      await api.delete(
        `/api/v1/${kind === "task" ? "tasks" : kind === "bookmark" ? "bookmarks" : "artifacts"}/${item.id}`,
        { data: { revision: item.revision } },
      ),
    );
}
const session = await api.storageState();
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const reports = [];
async function nav(page, name, width) {
  if (width < 1024)
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .first()
      .click();
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  if (width < 1024)
    await page.locator(".mobile-navigation").waitFor({ state: "hidden" });
}
for (const [engineName, engine] of Object.entries({
  chromium,
  firefox,
  webkit,
})) {
  if (
    process.argv.slice(3).length &&
    !process.argv.slice(3).includes(engineName)
  )
    continue;
  const browser = await engine.launch(
    engineName === "chromium" ? { channel: "chrome" } : {},
  );
  const sizes = (
    engineName === "chromium"
      ? [
          [320, 700],
          [390, 844],
          [768, 1024],
          [1440, 900],
          [844, 390],
        ]
      : [
          [390, 844],
          [1440, 900],
        ]
  ).filter(
    ([width]) =>
      !process.env.NIVRA_AUDIT_WIDTHS ||
      process.env.NIVRA_AUDIT_WIDTHS.split(",").map(Number).includes(width),
  );
  try {
    for (const [width, height] of sizes)
      for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: theme,
          storageState: session,
          hasTouch: width < 1024,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(base, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          (theme) =>
            document.documentElement.classList.contains("dark") ===
            (theme === "dark"),
          theme,
        );
        const label = `${engineName}-${width}-${height}-${theme}`;
        const sections = [];
        for (const [name] of [
          ["Tasks", "Add task"],
          ["Bookmarks", "Save link"],
          ["Artifacts", "Upload"],
          ["Trash", null],
        ]) {
          await nav(page, name, width);
          await page.locator(".section-toolbar").waitFor();
          if (name === "Trash") await page.locator(".trash-list").waitFor();
          const metrics = await page.evaluate(() => {
            const content = document.querySelector(".section-content"),
              toolbar = document.querySelector(".section-toolbar"),
              search = document.querySelector(".task-search"),
              heading = content.querySelector("h1");
            const controls = [
              ...content.querySelectorAll(
                '.section-create input,.section-create > button,.artifact-drop-actions button,.section-toolbar button,.section-toolbar [data-slot="select-trigger"]',
              ),
            ].filter((e) => e.getClientRects().length);
            return {
              headingX: heading.getBoundingClientRect().x,
              contentX:
                content.getBoundingClientRect().x +
                parseFloat(getComputedStyle(content).paddingLeft),
              overflow: document.documentElement.scrollWidth > innerWidth,
              searchHeight: search.getBoundingClientRect().height,
              controls: controls.map((e) => ({
                label: e.textContent || e.getAttribute("aria-label") || e.id,
                height: e.getBoundingClientRect().height,
              })),
              toolbarMargin: getComputedStyle(toolbar).marginTop,
              toolbarPadding: getComputedStyle(toolbar).paddingBottom,
              topBar: !!document.querySelector(".tasks-header"),
            };
          });
          assert.equal(metrics.overflow, false, label + name + " overflow");
          assert.ok(
            Math.abs(metrics.headingX - metrics.contentX) < 1,
            label + name + " heading alignment",
          );
          assert.equal(
            metrics.searchHeight,
            44,
            label + name + " search height",
          );
          assert.ok(
            metrics.controls.every((c) => c.height >= 44),
            label + name + " control heights",
          );
          assert.equal(metrics.toolbarMargin, "24px");
          assert.equal(metrics.toolbarPadding, "16px");
          assert.equal(metrics.topBar, false);
          assert.equal(await page.locator("[data-sonner-toaster]").count(), 0);
          await page.evaluate(() =>
            window.dispatchEvent(
              new CustomEvent("nivra:feedback", {
                detail: { message: "Audit input feedback", tone: "error" },
              }),
            ),
          );
          await page
            .getByRole("alert")
            .filter({ hasText: "Audit input feedback" })
            .waitFor();
          const inline = await page
            .locator(".inline-feedback")
            .evaluate((e) => ({
              position: getComputedStyle(e).position,
              overflow: e.scrollWidth > e.clientWidth,
              dismissHeight: e.querySelector("button").getBoundingClientRect()
                .height,
            }));
          assert.equal(inline.position, "static");
          assert.equal(inline.overflow, false);
          assert.equal(inline.dismissHeight, 44);
          await page
            .getByRole("button", { name: "Dismiss notification", exact: true })
            .click();
          if (name === "Trash") {
            await page
              .getByRole("textbox", {
                name: "Search deleted items",
                exact: true,
              })
              .fill("unique-unmatched-empty-state");
            await page
              .getByRole("heading", {
                name: "No matching deleted items",
                exact: true,
              })
              .waitFor();
            const empty = await page.locator(".tasks-empty").evaluate((e) => ({
              align: getComputedStyle(e).textAlign,
              padding: getComputedStyle(e).paddingTop,
              titleSize: getComputedStyle(e.querySelector("h2")).fontSize,
              overflow: e.scrollWidth > e.clientWidth,
            }));
            assert.equal(empty.align, "center");
            assert.equal(empty.padding, "48px");
            assert.equal(empty.titleSize, "16px");
            assert.equal(empty.overflow, false);
            if (width < 767) {
              const selector = page.getByRole("combobox", {
                name: "Deleted item type",
                exact: true,
              });
              assert.ok(
                Math.abs(
                  (await selector.boundingBox()).width -
                    (await page.locator(".task-search").boundingBox()).width,
                ) < 1,
              );
            }
            if ([390, 1440].includes(width))
              await page.screenshot({
                path: path.join(output, `${label}-trash-empty.png`),
              });
            await page
              .getByRole("textbox", {
                name: "Search deleted items",
                exact: true,
              })
              .fill("");
            await page.locator(".trash-list").waitFor();
          }

          if (width < 1024)
            await page
              .getByRole("button", { name: "Open navigation", exact: true })
              .first()
              .click();
          const sidebar = page.locator(
            width < 1024 ? ".mobile-navigation" : ".desktop-navigation",
          );
          assert.equal(await sidebar.locator(".new-note").count(), 0);
          assert.equal(
            await sidebar
              .getByRole("button", { name: "Search", exact: true })
              .count(),
            1,
          );
          assert.equal(
            await sidebar.getByRole("button", { name: /^Quick/ }).count(),
            1,
          );
          if (width < 1024) await page.keyboard.press("Escape");
          if (name === "Trash") {
            assert.equal(
              await page
                .getByRole("button", { name: "Create a note", exact: true })
                .count(),
              0,
            );
            assert.equal(
              await page
                .getByRole("button", { name: "New note", exact: true })
                .count(),
              0,
            );
          }
          const input = page.getByRole("textbox", {
            name:
              name === "Trash"
                ? "Search deleted items"
                : name === "Bookmarks"
                  ? "Search bookmarks"
                  : `Search ${name.toLowerCase()}`,
            exact: true,
          });
          await input.focus();
          const focus = await input.evaluate((e) => ({
            border: getComputedStyle(e.parentElement).borderColor,
            foreground: getComputedStyle(
              document.documentElement,
            ).getPropertyValue("--foreground"),
            outline: getComputedStyle(e).outlineStyle,
            shadow: getComputedStyle(e).boxShadow,
          }));
          assert.equal(focus.outline, "none");
          assert.equal(focus.shadow, "none");
          await page.addScriptTag({ content: axe });
          const violations = await page.evaluate(async () =>
            (
              await window.axe.run(document.querySelector(".section-content"))
            ).violations
              .filter((v) => ["serious", "critical"].includes(v.impact))
              .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          );
          assert.deepEqual(violations, [], label + name + " axe");
          sections.push({ name, ...metrics, focus, violations });
          if ([390, 1440].includes(width))
            await page.screenshot({
              path: path.join(output, `${label}-${name.toLowerCase()}.png`),
            });
        }
        assert.deepEqual(errors, [], label + " page errors");
        reports.push({ label, sections });
        await context.close();
        console.log("Passed", label);
      }
    if (engineName === "chromium") {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: session,
      });
      const page = await context.newPage();
      await page.goto(base);
      await nav(page, "Trash", 390);
      const deleted = await value(await api.get("/api/v1/trash"));
      const artifact = deleted.items.find(
        (i) => i.id === seeds.find((s) => s.kind === "artifact").id,
      );
      await page
        .getByRole("button", { name: `Restore ${artifact.title}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: `Restore ${artifact.title}`, exact: true })
        .waitFor({ state: "hidden" });
      assert.equal(
        (await api.get(`/api/v1/artifacts/${artifact.id}`)).status(),
        200,
      );
      await page
        .locator(".section-heading .inline-feedback")
        .filter({ hasText: "Artifact restored." })
        .waitFor();
      assert.equal(await page.locator("[data-sonner-toaster]").count(), 0);
      const task = deleted.items.find(
        (i) => i.id === seeds.find((s) => s.kind === "task").id,
      );
      await page
        .getByRole("button", {
          name: `Delete ${task.title} permanently`,
          exact: true,
        })
        .click();
      await page.getByRole("alertdialog").waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.ok(
        (await value(await api.get("/api/v1/trash"))).items.some(
          (i) => i.id === task.id,
        ),
      );
      await page
        .getByRole("button", {
          name: `Delete ${task.title} permanently`,
          exact: true,
        })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete permanently", exact: true })
        .click();
      await page
        .getByRole("button", { name: `Restore ${task.title}`, exact: true })
        .waitFor({ state: "hidden" });
      await context.close();
      const anonymous = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        login = await anonymous.newPage();
      await login.goto(base);
      await login.locator(".auth-panel").waitFor();
      assert.equal(await login.locator(".auth-page > header").count(), 0);
      assert.equal(await login.locator(".auth-panel .brand-mark").count(), 1);
      await login
        .getByRole("button", { name: /Forgot|recovery code/i })
        .click();
      assert.equal(await login.locator(".auth-page > header").count(), 0);
      await anonymous.close();
    }
  } finally {
    await browser.close();
  }
}
writeFileSync(
  path.join(output, "results.json"),
  JSON.stringify({ reports, passed: reports.length }, null, 2),
);
await api.dispose();
console.log(
  `Section audit passed ${reports.length} viewport/theme cases plus restore, permanent-delete confirmation and authentication header checks.`,
);
