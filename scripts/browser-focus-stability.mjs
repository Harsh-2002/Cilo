import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium, firefox, webkit, request } from "playwright";

const base = process.env.NIVRA_BROWSER_TEST_URL ?? "http://localhost:3015";
assert.equal(new URL(base).port, "3015", "Use the disposable audit server");
assert.ok(process.env.NIVRA_BROWSER_SESSION, "Synthetic session required");
assert.ok(
  process.env.NIVRA_AUDIT_FIXTURES,
  "Synthetic fixture manifest required",
);
const owner = await request.newContext({
  baseURL: base,
  storageState: process.env.NIVRA_BROWSER_SESSION,
  extraHTTPHeaders: { origin: base },
});
async function api(path, data, method = data ? "POST" : "GET") {
  const response = await owner.fetch(`/api/v1/${path}`, { method, data });
  assert.ok(
    response.ok(),
    `${method} ${path.split("?")[0]}: ${response.status()}`,
  );
  const result = await response.json();
  await response.dispose();
  return result;
}
assert.match((await api("status")).owner?.name ?? "", /audit|review|test/i);
const fixtures = JSON.parse(
  await readFile(process.env.NIVRA_AUDIT_FIXTURES, "utf8"),
);
const engine = process.env.NIVRA_AUDIT_ENGINE ?? "chromium";
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium" ? { args: ["--disable-dev-shm-usage"] } : {},
);
const quickOnly = process.env.NIVRA_AUDIT_MODE === "quick";
const stamp = randomUUID().slice(0, 8);
const board = await api("boards", { name: `Focus test ${stamp}` });
const task = await api("tasks", {
  title: `Move test ${stamp}`,
  boardId: board.id,
});
const anchor = await api("tasks", {
  title: `Stable test ${stamp}`,
  boardId: board.id,
});

async function watch(page, selector, rootSelector) {
  await page.evaluate(
    ({ selector, rootSelector }) => {
      window.__stability?.observer.disconnect();
      const root = document.querySelector(rootSelector);
      const originals = [...document.querySelectorAll(selector)];
      if (!root || !originals.length) throw Error("Stability target missing");
      const state = { removed: false, loader: false, originals };
      state.observer = new MutationObserver(() => {
        state.removed ||= originals.some((element) => !element.isConnected);
        state.loader ||= !!root.querySelector(".loading-state");
      });
      state.observer.observe(root, { subtree: true, childList: true });
      window.__stability = state;
    },
    { selector, rootSelector },
  );
}
async function stable(page, message) {
  assert.deepEqual(
    await page.evaluate(() => ({
      removed: window.__stability.removed,
      loader: window.__stability.loader,
    })),
    { removed: false, loader: false },
    message,
  );
}
async function settled(page, selector) {
  await page.locator(selector).first().waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".loading-state, .schedule-skeleton"),
  );
}
async function completion(page) {
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("nivra:completion", { detail: { kind: "content" } }),
    ),
  );
  await page.waitForTimeout(900);
}
let checked = 0;
try {
  for (const width of (process.env.NIVRA_AUDIT_WIDTHS ?? "390,1440")
    .split(",")
    .map(Number)) {
    for (const theme of ["light", "dark"]) {
      await api("settings", { theme }, "PATCH");
      const context = await browser.newContext({
        storageState: process.env.NIVRA_BROWSER_SESSION,
        viewport: { width, height: width === 320 ? 568 : 900 },
        hasTouch: width < 1024,
        colorScheme: theme,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(`${base}/api/v1/**`, async (route) => {
        const req = route.request();
        if (
          req.method() === "GET" &&
          /\/(tasks|boards|favorites|item-tags|tags)(\/|\?)/.test(req.url())
        )
          await new Promise((resolve) => setTimeout(resolve, 300));
        if (req.method() === "POST" && /\/(tasks|bookmarks)$/.test(req.url()))
          await new Promise((resolve) => setTimeout(resolve, 450));
        await route.continue();
      });
      try {
        if (width >= 1024) {
          await page.goto(`${base}/overview`);
          await settled(page, ".overview-widget");
          await page
            .locator(".desktop-navigation")
            .getByRole("button", { name: "Tasks", exact: true })
            .click();
        } else await page.goto(`${base}/tasks`);
        const input = page.getByRole("textbox", {
          name: "New task",
          exact: true,
        });
        await settled(page, ".task-list");
        await page.locator(`html.${theme}`).waitFor();
        assert.equal(
          await input.evaluate((field) => field === document.activeElement),
          width >= 1024,
          "Desktop creation focus; no unsolicited phone keyboard",
        );
        if (!quickOnly) {
          const title = `Keyboard ${stamp} ${width} ${theme}`;
          await watch(
            page,
            "#task-title, .task-list li:first-child",
            ".tasks-panel",
          );
          if (width >= 1024) await page.keyboard.type(title);
          else await input.fill(title);
          await input.press("Enter");
          await input.press("Enter");
          await input.fill("Next unfinished task");
          await page.getByText(title, { exact: true }).waitFor();
          await page.waitForTimeout(900);
          await stable(page, "Task creation and SSE preserve rows and input");
          assert.equal(await input.inputValue(), "Next unfinished task");
          assert.ok(
            await input.evaluate((field) => field === document.activeElement),
          );
          assert.equal(
            (await api(`tasks?q=${encodeURIComponent(title)}`)).items.length,
            1,
          );
          await input.fill("");
          await input.fill("Composition task");
          await input.evaluate((field) =>
            field.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                isComposing: true,
                bubbles: true,
                cancelable: true,
              }),
            ),
          );
          assert.equal(await input.inputValue(), "Composition task");
          assert.equal(
            (await api("tasks?q=Composition%20task")).items.length,
            0,
          );
          await input.fill("");

          const failedSave = async (route) => {
            if (route.request().method() === "POST")
              await route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({
                  code: "temporarily_unavailable",
                  error: "Try again shortly.",
                }),
              });
            else await route.fallback();
          };
          await page.route("**/api/v1/tasks", failedSave);
          await input.fill("Keep failed task draft");
          await input.press("Enter");
          await page
            .getByRole("alert")
            .filter({ hasText: "Try again shortly." })
            .waitFor();
          assert.equal(await input.inputValue(), "Keep failed task draft");
          assert.ok(
            await input.evaluate((field) => field === document.activeElement),
          );
          await stable(
            page,
            "A failed task save preserves the input and previous rows",
          );
          await page.unroute("**/api/v1/tasks", failedSave);
          await input.fill("");

          await page.goto(`${base}/tasks?view=board&board=${board.id}`);
          await settled(page, ".kanban-grid .kanban-card");
          const boardInput = page.getByRole("textbox", {
            name: "New task",
            exact: true,
          });
          assert.equal(
            await boardInput.evaluate(
              (field) => field === document.activeElement,
            ),
            width >= 1024,
          );
          await boardInput.fill("Board draft stays here");
          await watch(
            page,
            `#board-new-task, [data-task-id="${anchor.id}"]`,
            ".kanban-panel",
          );
          const remoteTitle = `Remote ${stamp} ${width} ${theme}`;
          await api("tasks", { title: remoteTitle, boardId: board.id });
          await page
            .getByRole("button", { name: remoteTitle, exact: true })
            .waitFor();
          await stable(
            page,
            "Real SSE leaves the board and empty stages mounted",
          );
          assert.equal(await boardInput.inputValue(), "Board draft stays here");
          assert.ok(
            await boardInput.evaluate(
              (field) => field === document.activeElement,
            ),
          );
          await boardInput.fill("");
          const boardTitle = `Board keyboard ${stamp} ${width} ${theme}`;
          await boardInput.fill(boardTitle);
          await boardInput.press("Enter");
          await page
            .getByRole("button", { name: boardTitle, exact: true })
            .waitFor();
          await page
            .getByRole("button", { name: "Add task", exact: true })
            .waitFor({ state: "visible" });
          await page.waitForTimeout(900);
          await stable(
            page,
            "Adding to a board preserves the existing card nodes",
          );
          assert.ok(
            await boardInput.evaluate(
              (field) => field === document.activeElement,
            ),
          );
          assert.equal(await boardInput.inputValue(), "");
          const movable = await api(`tasks/${task.id}`);
          if (width >= 1024) {
            await page
              .getByRole("button", { name: `Actions for ${movable.title}` })
              .click();
            await page
              .getByRole("menuitem", {
                name:
                  movable.status === "todo"
                    ? "Move to In progress"
                    : "Move to To do",
                exact: true,
              })
              .click();
            await page.waitForTimeout(1300);
            await stable(
              page,
              "Moving a task preserves unrelated cards and board input",
            );
            assert.notEqual(
              (await api(`tasks/${task.id}`)).status,
              movable.status,
            );
          }

          for (const [path, selector, root] of [
            ["overview", ".overview-widget", ".overview-panel"],
            ["notes", ".note-list-item", ".notes-list"],
            ["journal", ".note-list-item", ".notes-list"],
            ["bookmarks", ".bookmark-card", ".bookmarks-panel"],
            ["artifacts", ".artifact-card", ".artifacts-panel"],
            ["forms", ".tasks-panel li", ".tasks-panel"],
            ["favorites", ".tag-collection-card", ".tag-collection"],
            [
              `notes?tag=${fixtures.tag.id}`,
              ".tag-collection-card",
              ".tag-collection",
            ],
          ]) {
            await page.goto(`${base}/${path}`);
            await settled(page, selector);
            await watch(page, selector, root);
            await completion(page);
            await stable(page, `${path} retains visible content during SSE`);
            if (path === "bookmarks") {
              assert.equal(
                await page
                  .locator("#bookmark-url")
                  .evaluate((field) => field === document.activeElement),
                width >= 1024,
              );
              const link = page.locator("#bookmark-url");
              const url = `https://example.invalid/${stamp}-${width}-${theme}`;
              await link.fill(url);
              await link.press("Enter");
              await link.fill("https://example.invalid/next-draft");
              await page
                .locator("#bookmark-collection")
                .fill("Next collection draft");
              await page
                .getByText(
                  "Link saved. Fetching its preview in the background.",
                  { exact: true },
                )
                .waitFor();
              assert.equal(
                await link.inputValue(),
                "https://example.invalid/next-draft",
              );
              assert.equal(
                await page.locator("#bookmark-collection").inputValue(),
                "Next collection draft",
              );
              assert.ok(
                await page
                  .locator("#bookmark-collection")
                  .evaluate((field) => field === document.activeElement),
              );
              await stable(
                page,
                "Bookmark Enter save preserves draft and existing cards",
              );
              await link.fill("");
              await page.locator("#bookmark-collection").fill("");
            }
          }

          await page.goto(`${base}/calendar`);
          await settled(page, ".schedule-month-grid");
          await watch(page, ".schedule-month-grid", ".schedule-panel");
          await completion(page);
          await stable(
            page,
            "Calendar keeps its grid during background refresh",
          );
          assert.equal(
            await page.getByText("Updating", { exact: true }).count(),
            0,
          );

          await page
            .getByRole("button", { name: /unscheduled tasks$/ })
            .click();
          await settled(page, ".schedule-agenda-entry");
          await watch(page, ".schedule-agenda-entry", ".schedule-panel");
          await completion(page);
          await stable(page, "Unscheduled task cards stay visible during SSE");
          assert.equal(
            await page.getByText("Loading tasks…", { exact: true }).count(),
            0,
          );

          await page.keyboard.press("Control+k");
          const search = page.locator(".global-search-dialog");
          await search.waitFor();
          if (width < 1024) await search.getByRole("combobox").focus();
          await page.waitForFunction(
            () => document.querySelectorAll("[cmdk-item]").length >= 2,
          );
          const previousSelection = await search
            .locator('[cmdk-item][data-selected="true"]')
            .getAttribute("data-value");
          await page.keyboard.press("ArrowDown");
          const selected = search.locator('[cmdk-item][data-selected="true"]');
          const selectedValue = await selected.getAttribute("data-value");
          assert.notEqual(
            selectedValue,
            previousSelection,
            "Arrow keys select another search result",
          );
          await completion(page);
          assert.equal(
            await selected.getAttribute("data-value"),
            selectedValue,
            "SSE keeps the keyboard search selection",
          );
          assert.ok(
            await search
              .getByRole("combobox")
              .evaluate((field) => field === document.activeElement),
          );
          await page.keyboard.press("Escape");
        }

        await page.goto(`${base}/tasks`);
        await settled(page, ".task-list");
        await page.keyboard.press("Control+Shift+Enter");
        const quick = page.getByRole("dialog", { name: "Quick", exact: true });
        await quick.waitFor();
        const quickInput = quick.getByRole("textbox", { name: "Quick text" });
        const quickTitle = `Quick ${stamp} ${width} ${theme}`;
        await quickInput.fill(quickTitle);
        await quickInput.press(width >= 1024 ? "Shift+Enter" : "Enter");
        await quickInput.pressSequentially("Second line");
        assert.equal(
          await quickInput.inputValue(),
          `${quickTitle}\nSecond line`,
        );
        await quickInput.evaluate((field) =>
          field.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              isComposing: true,
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        assert.ok(await quick.isVisible());
        if (width >= 1024) await quickInput.press("Enter");
        else
          await quick
            .getByRole("button", { name: "Save note", exact: true })
            .click();
        await quick.waitFor({ state: "hidden" });
        const created = await api(`notes?q=${encodeURIComponent(quickTitle)}`);
        assert.equal(created.items.length, 1);
        assert.match(
          (await api(`notes/${created.items[0].id}`)).text,
          /Second line/,
        );

        await page.keyboard.press("Control+Shift+Enter");
        await quick.waitFor();
        await quick.getByRole("button", { name: "Task", exact: true }).click();
        const quickTask = `Quick task ${stamp} ${width} ${theme}`;
        await quickInput.fill(quickTask);
        await quickInput.press("Enter");
        await quick.waitFor({ state: "hidden" });
        await page.getByText(quickTask, { exact: true }).waitFor();
        assert.equal(
          await input.evaluate((field) => field === document.activeElement),
          width >= 1024,
        );
        await page.keyboard.press("Control+Shift+Enter");
        await quick.waitFor();
        const quickUrl = `https://example.invalid/quick-${stamp}-${width}-${theme}`;
        await quickInput.fill(quickUrl);
        await quickInput.press(width >= 1024 ? "Meta+Enter" : "Control+Enter");
        await quick.waitFor({ state: "hidden" });
        const links = await api(`bookmarks?q=${encodeURIComponent(quickUrl)}`);
        assert.equal(links.items.length, 1);
        assert.equal(links.items[0].url, quickUrl);

        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        assert.deepEqual(errors, []);
        checked++;
        console.log(
          `${engine} ${width}px ${theme}: ${quickOnly ? "Quick/focus" : "state, SSE, focus and keyboard"} passed`,
        );
      } finally {
        await context.close();
      }
    }
  }
  console.log(
    `Passed ${checked} ${quickOnly ? "Quick/focus" : "complete focus/stability"} workflows`,
  );
} finally {
  await browser.close();
  await owner.dispose();
}
