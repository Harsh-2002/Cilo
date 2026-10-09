import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox, webkit, request } from "playwright";

const base = process.env.NIVRA_BROWSER_TEST_URL ?? "http://localhost:3015";
if (new URL(base).port !== "3015" || !process.env.NIVRA_BROWSER_SESSION)
  throw new Error(
    "Use the disposable Forms server and its saved owner session.",
  );
const owner = await request.newContext({
  baseURL: base,
  storageState: process.env.NIVRA_BROWSER_SESSION,
  extraHTTPHeaders: { origin: base },
});
async function api(path, data, method = data === undefined ? "GET" : "POST") {
  const response = await owner.fetch(`/api/v1/${path}`, { method, data });
  const body = await response.json();
  assert.ok(response.ok(), `${response.status()} ${JSON.stringify(body)}`);
  return body;
}
const capture = process.env.NIVRA_BROWSER_REVIEW_DIR;
if (capture) await mkdir(capture, { recursive: true });
let checked = 0;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of name === "chromium"
        ? [320, 390, 768, 1280, 1440]
        : [390, 1440])
        for (const colorScheme of ["light", "dark"]) {
          console.log(`Checking owner ${name} ${width} ${colorScheme}`);
          await api("settings", { theme: colorScheme }, "PATCH");
          const viewport = {
            width,
            height:
              width === 320
                ? 568
                : width === 768
                  ? 1024
                  : width === 1280
                    ? 720
                    : 900,
          };
          const context = await browser.newContext({
            serviceWorkers: "block",
            storageState: await owner.storageState(),
            viewport,
            colorScheme,
          });
          await context.addInitScript(
            (theme) => localStorage.setItem("nivra-theme", theme),
            colorScheme,
          );
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(`${base}/forms`);
          await page
            .getByRole("button", { name: "New form", exact: true })
            .first()
            .waitFor();
          const controls = await Promise.all(
            [
              page.getByRole("combobox", { name: "Form status", exact: true }),
              page.getByRole("textbox", { name: "Search forms", exact: true }),
              page
                .getByRole("button", { name: "New form", exact: true })
                .first(),
            ].map((control) => control.boundingBox()),
          );
          for (let index = 0; index < controls.length; index++) {
            assert.ok(
              controls[index]?.height >= 44,
              "Form list controls remain touch-sized",
            );
            for (const other of controls.slice(index + 1)) {
              const current = controls[index];
              assert.equal(
                current.x < other.x + other.width &&
                  current.x + current.width > other.x &&
                  current.y < other.y + other.height &&
                  current.y + current.height > other.y,
                false,
                "Form list controls do not overlap",
              );
            }
          }
          await page
            .getByRole("button", { name: "New form", exact: true })
            .first()
            .click();
          await page
            .getByRole("textbox", { name: "Form title", exact: true })
            .waitFor();
          await page.waitForFunction(
            (dark) =>
              document.documentElement.classList.contains("dark") === dark,
            colorScheme === "dark",
          );
          const id = /\/forms\/([^/]+)\/build/.exec(page.url())[1];
          const title = `UI survey ${name} ${width} ${colorScheme}`;
          await page
            .getByRole("textbox", { name: "Form title", exact: true })
            .fill(title);
          await page
            .getByRole("button", { name: "Add question", exact: true })
            .click();
          await page
            .getByLabel("Question", { exact: true })
            .fill("Your feedback");
          await page
            .getByRole("checkbox", { name: "Required", exact: true })
            .check();
          await page
            .getByRole("combobox", { name: "New question type" })
            .click({ delay: 100 });
          await page.waitForFunction(
            () => document.activeElement?.getAttribute("role") === "option",
          );
          await page
            .getByRole("option", { name: "Single choice", exact: true })
            .click();
          await page
            .getByRole("option", { name: "Single choice", exact: true })
            .waitFor({ state: "hidden" });
          await page
            .getByRole("button", { name: "Add question", exact: true })
            .click();
          await page
            .getByLabel("Question", { exact: true })
            .last()
            .fill("Area");
          const questionOrder = () =>
            page
              .locator(".form-builder")
              .getByLabel("Question", { exact: true })
              .evaluateAll((inputs) => inputs.map((input) => input.value));
          if (
            colorScheme === "light" &&
            (width === 390 || (name === "chromium" && width === 320))
          ) {
            const questionId = await page
              .locator(".form-question-block")
              .first()
              .getAttribute("data-field-id");
            await page
              .getByRole("combobox", { name: "Question 1 type", exact: true })
              .click();
            await page
              .getByRole("option", { name: "Email", exact: true })
              .click();
            await page.waitForFunction(() =>
              document
                .querySelector('[aria-label="Question 1 type"]')
                .textContent.includes("Email"),
            );
            assert.equal(
              await page
                .getByLabel("Question", { exact: true })
                .first()
                .inputValue(),
              "Your feedback",
            );
            assert.notEqual(
              await page
                .locator(".form-question-block")
                .first()
                .getAttribute("data-field-id"),
              questionId,
            );
            await page
              .getByRole("combobox", { name: "Question 1 type", exact: true })
              .click();
            await page
              .getByRole("option", { name: "Short text", exact: true })
              .click();
            await page.waitForFunction(() =>
              document
                .querySelector('[aria-label="Question 1 type"]')
                .textContent.includes("Short text"),
            );
            await page
              .getByRole("button", { name: "Question 1 actions", exact: true })
              .click();
            await page
              .getByRole("menuitem", {
                name: "Add question below",
                exact: true,
              })
              .click();
            await page
              .getByLabel("Question", { exact: true })
              .nth(1)
              .fill("Inserted question");
            assert.deepEqual(await questionOrder(), [
              "Your feedback",
              "Inserted question",
              "Area",
            ]);
            await page
              .getByRole("button", { name: "Question 2 actions", exact: true })
              .click();
            await page
              .getByRole("menuitem", { name: "Remove question", exact: true })
              .click();
            await page
              .getByRole("alertdialog")
              .getByRole("button", { name: "Remove question", exact: true })
              .click();
            await page.waitForFunction(
              () =>
                document.querySelectorAll(".form-question-block").length === 2,
            );
            assert.deepEqual(await questionOrder(), ["Your feedback", "Area"]);
          }
          const builderSpacing = await page
            .locator(".form-builder")
            .evaluate((builder) => {
              const gaps = [...builder.querySelectorAll("label.grid")].map(
                (label) => {
                  const title = label.children[0].getBoundingClientRect();
                  const control = label.children[1].getBoundingClientRect();
                  return control.top - title.bottom;
                },
              );
              const selector = builder
                .querySelector('[aria-label="New question type"]')
                .getBoundingClientRect();
              const add = [...builder.querySelectorAll("button")]
                .find((button) => button.textContent.includes("Add question"))
                .getBoundingClientRect();
              return {
                gaps,
                selectorHeight: selector.height,
                addHeight: add.height,
              };
            });
          assert.ok(
            builderSpacing.gaps.every((gap) => Math.abs(gap - 8) < 1),
            "Labels have a consistent 8px gap",
          );
          assert.equal(builderSpacing.selectorHeight, 44);
          assert.equal(builderSpacing.addHeight, 44);
          if (capture && name === "chromium") {
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({
              path: `${capture}/builder-${width}-${colorScheme}.png`,
              fullPage: true,
            });
          }
          if (
            name === "chromium" &&
            colorScheme === "light" &&
            [390, 1440].includes(width)
          ) {
            const handle = page.getByRole("button", {
              name: "Reorder question 1",
              exact: true,
            });
            if (width === 1440) {
              await handle.scrollIntoViewIfNeeded();
              const start = await handle.boundingBox();
              const target = await page
                .locator(".form-question-block")
                .nth(1)
                .boundingBox();
              await page.mouse.move(
                start.x + start.width / 2,
                start.y + start.height / 2,
              );
              await page.mouse.down();
              await page.mouse.move(
                target.x + target.width / 2,
                target.y + target.height / 2,
                { steps: 20 },
              );
              await page.mouse.up();
            } else {
              await handle.focus();
              await page.keyboard.press("Space");
              await page.waitForFunction(
                () =>
                  !!document.querySelector(".form-question-block.is-dragging"),
              );
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              await page.keyboard.press("ArrowDown");
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              await page.keyboard.press("Space");
            }
            await page.waitForFunction(
              () =>
                document.querySelector(".form-question-block input")?.value ===
                "Area",
            );
            await page.waitForFunction(
              () =>
                document.querySelectorAll(".form-question-block").length === 2,
            );
            assert.deepEqual(await questionOrder(), ["Area", "Your feedback"]);
            await page
              .getByRole("button", { name: "Question 2 actions", exact: true })
              .click();
            await page
              .getByRole("menuitem", { name: "Move up", exact: true })
              .click();
            assert.deepEqual(await questionOrder(), ["Your feedback", "Area"]);
            if (width === 390) {
              const reorder = page.getByRole("button", {
                name: "Reorder question 1",
                exact: true,
              });
              await reorder.focus();
              await page.keyboard.press("Space");
              await page.waitForFunction(
                () =>
                  !!document.querySelector(".form-question-block.is-dragging"),
              );
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              await page.keyboard.press("ArrowDown");
              await page.waitForFunction(
                () =>
                  document.querySelector(
                    ".form-builder .form-question-block input",
                  )?.value === "Area",
              );
              await page.keyboard.press("Escape");
              await page.waitForFunction(
                () =>
                  !document.querySelector(".form-question-block.is-dragging"),
              );
              assert.deepEqual(
                await questionOrder(),
                ["Your feedback", "Area"],
                "Cancel restores the unsaved drag order",
              );
            }
          }
          const message = page.getByRole("textbox", {
            name: "Confirmation message",
            exact: true,
          });
          const labelBox = await page
            .locator('label[for="form-confirmation"]')
            .boundingBox();
          const messageBox = await message.boundingBox();
          assert.equal(
            messageBox.y - labelBox.y - labelBox.height,
            8,
            "Confirmation label sits directly above its field",
          );
          await message.fill("Thanks ");
          await message.press("End");
          await page
            .getByRole("button", { name: "Insert answer", exact: true })
            .click();
          const menuBox = await page.getByRole("menu").boundingBox();
          assert.ok(
            menuBox.x >= 12 && menuBox.x + menuBox.width <= width - 12,
            "Variable menu respects the viewport gutter",
          );
          await page
            .getByRole("menuitem", { name: "1. Your feedback", exact: true })
            .click();
          assert.equal(
            await message.inputValue(),
            "Thanks {{1. Your feedback}}",
          );
          await page
            .getByRole("button", { name: "Preview", exact: true })
            .click();
          const preview = page.getByRole("dialog", {
            name: "Preview",
            exact: true,
          });
          await preview
            .getByRole("textbox", { name: "Your feedback", exact: true })
            .fill("Preview only");
          await preview
            .getByRole("button", { name: "Try submission", exact: true })
            .click();
          await preview
            .getByRole("heading", { name: "Preview complete" })
            .waitFor();
          await preview
            .getByText("Thanks Preview only", { exact: true })
            .waitFor();
          await preview
            .getByRole("button", { name: "Back to form", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Share", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Closing date", exact: true })
            .click();
          await page
            .getByRole("textbox", { name: "Enter closing date", exact: true })
            .fill("2099-10-31");
          await page
            .getByRole("button", { name: "Set date", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Publish", exact: true })
            .click();
          await page
            .getByRole("textbox", { name: "Public link", exact: true })
            .waitFor();
          const published = await api(`forms/${id}`);
          assert.equal(published.deadline.date, "2099-10-31");
          assert.equal(published.title, title);
          assert.equal(published.total, 0, "Preview must not submit");
          const publicContext = await browser.newContext({
            viewport,
            serviceWorkers: "block",
          });
          const publicPage = await publicContext.newPage();
          if (name === "webkit" && width === 390 && colorScheme === "light") {
            let release;
            const scripts = new Promise((resolve) => {
              release = resolve;
            });
            await publicContext.route(
              "**/_next/static/**/*.js",
              async (route) => {
                await scripts;
                await route.continue();
              },
            );
            const navigation = publicPage.goto(published.url, {
              waitUntil: "domcontentloaded",
            });
            try {
              const input = publicPage.getByRole("textbox", {
                name: "Your feedback",
                exact: true,
              });
              await input.waitFor();
              assert.equal(
                await input.isDisabled(),
                true,
                "Server-rendered inputs wait for hydration instead of losing early answers",
              );
            } finally {
              release();
            }
            await navigation;
            await publicContext.unroute("**/_next/static/**/*.js");
          } else await publicPage.goto(published.url);
          await publicPage
            .getByRole("textbox", { name: "Your feedback", exact: true })
            .fill("A useful response");
          await publicPage
            .getByRole("group", { name: "Area", exact: true })
            .getByRole("button", { name: "Option 1", exact: true })
            .click();
          await publicPage
            .getByRole("button", { name: "Submit", exact: true })
            .click();
          await publicPage
            .getByRole("heading", { name: "Response submitted" })
            .waitFor();
          await publicPage
            .getByText("Thanks A useful response", { exact: true })
            .waitFor();
          await publicContext.close();
          await page
            .getByRole("button", { name: "Responses", exact: true })
            .click();
          await page.getByText("1 answered", { exact: true }).first().waitFor();
          await page
            .getByRole("button", { name: "Submissions", exact: true })
            .click();
          await page
            .getByText("A useful response", { exact: false })
            .first()
            .click();
          await page
            .getByRole("heading", { name: "Submission", exact: true })
            .waitFor();
          await page
            .getByRole("button", { name: "Mark reviewed", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Mark as new", exact: true })
            .waitFor();
          const deepUrl = page.url();
          await page.reload();
          await page
            .getByRole("heading", { name: "Submission", exact: true })
            .waitFor();
          assert.equal(page.url(), deepUrl);
          await page
            .getByRole("button", { name: "Build", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Add form to Favorites", exact: true })
            .click();
          await page
            .getByRole("status")
            .filter({ hasText: /^Saved$/ })
            .waitFor();
          assert.equal((await api(`forms/${id}`)).favorite, true);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            false,
            `${name}/${width}/${colorScheme}: overflow`,
          );
          if (capture && name === "chromium" && colorScheme === "light")
            await page.screenshot({
              path: `${capture}/${width === 390 ? "mobile" : "desktop"}.png`,
              fullPage: true,
            });
          if (
            name === "chromium" &&
            width === 1440 &&
            colorScheme === "light"
          ) {
            let lost = false;
            await page.route(`**/api/v1/forms/${id}`, async (route) => {
              if (route.request().method() === "PATCH" && !lost) {
                lost = true;
                await route.fetch();
                await route.abort();
              } else await route.continue();
            });
            const before = await api(`forms/${id}`);
            await page
              .getByRole("textbox", { name: "Form title", exact: true })
              .fill("Lost response retry");
            await page
              .getByRole("button", { name: "Retry save", exact: true })
              .waitFor();
            await page
              .getByRole("button", { name: "Retry save", exact: true })
              .click();
            await page
              .getByRole("status")
              .filter({ hasText: /^Saved$/ })
              .waitFor();
            assert.equal(
              (await api(`forms/${id}`)).revision,
              before.revision + 1,
              "Save retry must not duplicate an update",
            );
            await page.unroute(`**/api/v1/forms/${id}`);
            let intercepted;
            const paused = new Promise((resolve) => {
              intercepted = resolve;
            });
            let release;
            const resume = new Promise((resolve) => {
              release = resolve;
            });
            await page.route(`**/api/v1/forms/${id}`, async (route) => {
              if (route.request().method() === "PATCH") {
                intercepted();
                await resume;
              }
              await route.continue();
            });
            await page
              .getByRole("textbox", { name: "Form title", exact: true })
              .fill("Keep my unsaved edit");
            await paused;
            const latest = await api(`forms/${id}`);
            await api(
              `forms/${id}`,
              {
                revision: latest.revision,
                definition: {
                  ...latest.definition,
                  title: "Newer server edit",
                },
              },
              "PATCH",
            );
            release();
            await page
              .getByRole("status")
              .filter({ hasText: "Save conflict" })
              .waitFor();
            assert.equal(
              await page
                .getByRole("textbox", { name: "Form title", exact: true })
                .inputValue(),
              "Keep my unsaved edit",
            );
            await page
              .getByRole("region", { name: "Form workspace", exact: true })
              .getByRole("button", { name: "Forms", exact: true })
              .click();
            assert.match(page.url(), /\/build$/);
            await page.unroute(`**/api/v1/forms/${id}`);
            await page
              .getByRole("button", { name: "Reload form", exact: true })
              .click();
            await page
              .getByRole("alertdialog")
              .getByRole("button", { name: "Reload form", exact: true })
              .click();
            await page
              .getByRole("textbox", { name: "Form title", exact: true })
              .waitFor();
            assert.equal(
              await page
                .getByRole("textbox", { name: "Form title", exact: true })
                .inputValue(),
              "Newer server edit",
            );
            const other = await context.newPage();
            await other.goto(`${base}/forms/${id}/build`);
            await page
              .getByRole("textbox", { name: "Form title", exact: true })
              .fill("Live SSE update");
            await other
              .getByRole("heading", { name: "Live SSE update", exact: true })
              .waitFor();
            await other.close();
            const tag =
              (await api("tags")).items.find(
                (item) => item.name === "Forms UI organization",
              ) ??
              (await api("tags", {
                name: "Forms UI organization",
                color: "gray",
              }));
            await page
              .getByRole("button", { name: "Edit tags for Live SSE update" })
              .click();
            await page
              .getByRole("checkbox", { name: "Forms UI organization" })
              .check();
            await page.getByRole("button", { name: "Save tags" }).click();
            assert.ok(
              (await api(`forms/${id}`)).tags.some(
                (item) => item.id === tag.id,
              ),
            );
            await page
              .getByRole("button", { name: "Responses", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Submissions", exact: true })
              .click();
            const download = page.waitForEvent("download");
            await page
              .getByRole("button", { name: "JSON", exact: true })
              .click();
            const file = await download;
            const stream = await file.createReadStream();
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const exported = JSON.parse(Buffer.concat(chunks).toString());
            assert.equal(exported.length, 1);
            assert.equal(exported[0].formId, id);
            const csvDownload = page.waitForEvent("download");
            await page
              .getByRole("button", { name: "CSV", exact: true })
              .click();
            const csvFile = await csvDownload;
            const csvStream = await csvFile.createReadStream();
            const csvChunks = [];
            for await (const chunk of csvStream) csvChunks.push(chunk);
            const csv = Buffer.concat(csvChunks).toString();
            assert.match(csv, /Your feedback/);
            assert.ok(csv.includes(exported[0].id));
          }
          await page
            .getByRole("button", { name: "Build", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Share", exact: true })
            .click();
          await page.goBack();
          assert.match(page.url(), /\/build$/);
          await page
            .getByRole("textbox", { name: "Form title", exact: true })
            .waitFor();
          await page.goForward();
          assert.match(page.url(), /\/share$/);
          await page
            .getByRole("textbox", { name: "Public link", exact: true })
            .waitFor();
          if (name === "chromium" && colorScheme === "light") {
            for (const route of [
              "overview",
              "notes",
              "journal",
              "tasks",
              "calendar",
              "bookmarks",
              "artifacts",
              "favorites",
              "trash",
              "search",
              "settings",
            ]) {
              const response = await page.goto(`${base}/${route}`);
              assert.equal(
                response.status(),
                200,
                `${route}: existing route must remain available`,
              );
              await page.locator(".workspace").waitFor();
              await page
                .locator('[data-slot="skeleton"]')
                .first()
                .waitFor({ state: "detached" });
              assert.equal(
                await page.evaluate(
                  () => document.documentElement.scrollWidth > innerWidth + 1,
                ),
                false,
                `${route}: horizontal overflow`,
              );
            }
          }
          assert.deepEqual(errors, []);
          checked++;
          await context.close();
        }
    } finally {
      await browser.close();
    }
  }
  console.log(
    `Owner Forms passed ${checked} browser/viewport/theme combinations; builder, preview, publication, public submission, summaries, review, direct refresh, Favorites, safe retries, revision conflict guard and two-tab SSE.`,
  );
} finally {
  await owner.dispose();
}
