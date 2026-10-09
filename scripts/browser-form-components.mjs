import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, request } from "playwright";

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
  assert.ok(response.ok(), `API ${response.status()}`);
  return response.json();
}
const types = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "amount",
  "rating",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "yes_no",
  "date",
  "time",
  "file",
  "consent",
  "heading",
  "description",
  "section",
];
const choiceTypes = ["single_choice", "multiple_choice", "dropdown"];
const displayTypes = ["heading", "description", "section"];
let checked = 0;
const browser = await chromium.launch();
try {
  for (const width of [320, 768, 1440])
    for (const theme of ["light", "dark"]) {
      await api("settings", { theme }, "PATCH");
      const form = await api("forms", {
        definition: {
          schemaVersion: 1,
          title: "Synthetic component coverage",
          fields: types.map((type) => ({
            id: randomUUID(),
            type,
            label: type,
            ...(choiceTypes.includes(type)
              ? {
                  choices: ["First", "Second"].map((label) => ({
                    id: randomUUID(),
                    label,
                  })),
                }
              : {}),
          })),
        },
      });
      const context = await browser.newContext({
        storageState: await owner.storageState(),
        colorScheme: theme,
        serviceWorkers: "block",
        viewport: { width, height: width === 320 ? 568 : 900 },
      });
      await context.addInitScript(
        (value) => localStorage.setItem("nivra-theme", value),
        theme,
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/forms/${form.id}/build`);
      await page
        .getByRole("textbox", { name: "Form title", exact: true })
        .waitFor();
      for (const [index, type] of types.entries()) {
        const block = page.locator(".form-question-block").nth(index);
        const label = block.getByRole("textbox", {
          name: displayTypes.includes(type) ? "Text" : "Question",
          exact: true,
        });
        await label.fill(`${type} edited`);
        await block
          .getByRole("button", { name: "Add help text", exact: true })
          .click();
        await block
          .getByRole("textbox", { name: "Help text (optional)", exact: true })
          .fill(`Help for ${type}`);
        if (choiceTypes.includes(type)) {
          await block
            .getByRole("textbox", {
              name: `Question ${index + 1} option 1`,
              exact: true,
            })
            .fill("Edited option");
          await block
            .getByRole("button", { name: "Add option", exact: true })
            .click();
          await block
            .getByRole("textbox", {
              name: `Question ${index + 1} option 3`,
              exact: true,
            })
            .fill("Extra option");
          await block
            .getByRole("button", { name: "Remove option 3", exact: true })
            .click();
        }
        if (!displayTypes.includes(type)) {
          await block
            .getByRole("checkbox", { name: "Required", exact: true })
            .check();
          const hasOptions = ![...choiceTypes, "yes_no", "consent"].includes(
            type,
          );
          const options = block.getByRole("button", {
            name: "Field options",
            exact: true,
          });
          assert.equal(await options.count(), hasOptions ? 1 : 0);
          if (hasOptions) {
            await options.click();
            assert.ok(
              await block
                .locator('[id^="settings-"]')
                .evaluate((element) => element.childElementCount > 0),
              `${type}: field options contain useful content`,
            );
          }
          if (["short_text", "long_text"].includes(type))
            await block
              .getByRole("spinbutton", {
                name: "Maximum characters",
                exact: true,
              })
              .fill("300");
          if (["number", "amount", "rating"].includes(type)) {
            await block
              .getByRole("spinbutton", { name: "Minimum", exact: true })
              .fill("1");
            await block
              .getByRole("spinbutton", { name: "Maximum", exact: true })
              .fill(type === "rating" ? "7" : "100");
          }
          if (type === "amount")
            await block
              .getByRole("textbox", { name: "Currency", exact: true })
              .fill("EUR");
          if (type === "file") {
            await block
              .getByRole("spinbutton", { name: "Maximum files", exact: true })
              .fill("2");
            await block
              .getByRole("checkbox", { name: "Images", exact: true })
              .uncheck();
            await block
              .getByRole("checkbox", { name: "Documents", exact: true })
              .check();
            await block
              .getByRole("checkbox", { name: "audio", exact: true })
              .check();
            await block
              .getByRole("checkbox", { name: "video", exact: true })
              .check();
          }
          const geometry = await block.evaluate((element) => ({
            targets: [
              ...element.querySelectorAll(
                'button:not([role="checkbox"]), input, textarea',
              ),
            ].map((node) => node.getBoundingClientRect().height),
            gaps: [...element.querySelectorAll("label.grid")].map((node) => {
              const title = node.children[0].getBoundingClientRect();
              const control = node.children[1].getBoundingClientRect();
              return control.top - title.bottom;
            }),
          }));
          assert.ok(
            geometry.targets.every((height) => height >= 44),
            `${type}: 44px controls`,
          );
          assert.ok(
            geometry.gaps.every((gap) => Math.abs(gap - 8) < 1),
            `${type}: 8px label spacing`,
          );
          if (hasOptions) await options.click();
        }
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${type}: overflow`,
        );
        checked++;
      }
      await page.getByText("Saved", { exact: true }).waitFor();
      const saved = await api(`forms/${form.id}`);
      for (const [index, type] of types.entries()) {
        const field = saved.definition.fields[index];
        assert.equal(field.type, type);
        assert.equal(field.label, `${type} edited`);
        assert.equal(field.description, `Help for ${type}`);
        assert.equal(field.required, !displayTypes.includes(type));
        if (choiceTypes.includes(type))
          assert.deepEqual(
            field.choices.map((choice) => choice.label),
            ["Edited option", "Second"],
          );
        if (["short_text", "long_text"].includes(type))
          assert.equal(field.maxLength, 300);
        if (["number", "amount", "rating"].includes(type)) {
          assert.equal(field.minimum, 1);
          assert.equal(field.maximum, type === "rating" ? 7 : 100);
        }
        if (type === "amount") assert.equal(field.currency, "EUR");
        if (type === "file") {
          assert.equal(field.maxFiles, 2);
          assert.deepEqual(field.fileTypes, ["document", "audio", "video"]);
        }
      }
      await page.reload();
      await page
        .getByRole("textbox", { name: "Form title", exact: true })
        .waitFor();
      assert.equal(await page.locator(".form-question-block").count(), 19);
      for (const [index, type] of types.entries()) {
        assert.equal(
          await page
            .locator(".form-question-block")
            .nth(index)
            .getByRole("textbox", {
              name: displayTypes.includes(type) ? "Text" : "Question",
              exact: true,
            })
            .inputValue(),
          `${type} edited`,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `All 19 builder components passed ${width} ${theme}: labels, help, options, required, limits, currency, file categories, targets, spacing, persistence and reload`,
      );
      await context.close();
    }
  console.log(`Passed ${checked} field-type/viewport/theme cases`);
} finally {
  await browser.close();
  await owner.dispose();
}
