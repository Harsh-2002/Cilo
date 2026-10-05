export default async function verifyConnectedResponsive(
  page,
  theme,
  widths,
  options,
) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Use the disposable review instance.");
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);
  const api = async (path, method = "GET", data) => {
    const r = await page.request.fetch(`${base}/api/nivra/${path}`, {
      method,
      data,
    });
    if (!r.ok()) throw new Error(`Fixture API failed: ${path} ${r.status()}`);
    return r.json();
  };
  if ((await api("status")).owner?.name !== "Review Owner")
    throw new Error("Use the disposable owner.");
  const stamp = Date.now();
  const target = await api("notes", "POST", {
    title: `Responsive target ${stamp}`,
  });
  let note = await api("notes", "POST", {
    title: `Responsive linked note ${stamp}`,
    document: {
      schemaVersion: 1,
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "link",
              href: `/?note=${target.id}`,
              content: [{ type: "text", text: target.title, styles: {} }],
            },
          ],
        },
        {
          type: "codeBlock",
          props: { language: "typescript" },
          content: [
            {
              type: "text",
              text: 'const idea: string = "Keep it simple";',
              styles: {},
            },
          ],
        },
      ],
    },
  });
  note = await api(`notes/${note.id}`, "PATCH", {
    revision: note.revision,
    title: `Responsive edited note ${stamp}`,
  });
  const task = await api("tasks", "POST", {
    title: `Responsive task ${stamp}`,
    dueDate: "2026-10-06",
    recurrence: "weekly",
    noteId: target.id,
  });
  const templates = await api("templates");
  const template = templates.find((t) => t.title === "Meeting") || templates[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", {
      name: theme === "dark" ? "Dark" : "Light",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.addScriptTag({ path: options.axePath });
  const reports = [];
  const inspect = async (surface, width, popup) => {
    await page.waitForTimeout(250);
    const report = await page.evaluate(async () => {
      const scan = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        nativeSelects: [...document.querySelectorAll("select")].filter(
          (e) =>
            e.getBoundingClientRect().width > 1 &&
            e.getBoundingClientRect().height > 1 &&
            getComputedStyle(e).opacity !== "0",
        ).length,
        smallInputs: [...document.querySelectorAll("input,textarea")]
          .filter(
            (e) =>
              e.getBoundingClientRect().width > 0 &&
              innerWidth < 768 &&
              parseFloat(getComputedStyle(e).fontSize) < 16,
          )
          .map((e) => e.getAttribute("aria-label") || e.id),
        violations: scan.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      };
    });
    if (popup) {
      const bounds = await page.locator(popup).boundingBox();
      report.contained =
        !!bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y + bounds.height <= (width === 1440 ? 900 : 844);
    }
    reports.push({ theme, width, surface, ...report });
    if ([1440, 768, 390, 320].includes(width))
      await page.screenshot({
        path: `${options.screenshotDir}/connected-${theme}-${surface.replaceAll(" ", "-")}-${width}.png`,
      });
  };
  const nav = async (name, width) => {
    const back = page.getByRole("button", {
      name: "Back to notes",
      exact: true,
    });
    if (await back.isVisible()) await back.click();
    if (width < 1024)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page.getByRole("button", { name, exact: true }).click();
    if (width < 1024)
      await page.locator(".mobile-navigation").waitFor({ state: "hidden" });
  };
  const openNote = async (id, width) => {
    await nav("Notes", width);
    await page
      .locator(".note-list-item")
      .filter({
        has: page.locator("strong", {
          hasText: id === note.id ? note.title : target.title,
        }),
      })
      .click();
    await page.locator(".bn-editor").waitFor();
  };
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await nav("Search", width);
    await page
      .getByPlaceholder("Search notes, tasks, bookmarks…")
      .fill("Responsive");
    await page.getByRole("option").filter({ hasText: note.title }).waitFor();
    await inspect("Global search", width, ".global-search-dialog");
    await page.keyboard.press("Escape");
    await page.locator(".global-search-dialog").waitFor({ state: "hidden" });
    await nav("Tasks", width);
    await page
      .getByRole("button", { name: `Actions for ${task.title}`, exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit task", exact: true })
      .click();
    await page.getByRole("menu").waitFor({ state: "hidden" });
    await inspect("Task editor", width);
    await page.getByRole("button", { name: "Due date", exact: true }).click();
    await inspect("Calendar", width, ".date-picker-popover");
    await page.keyboard.press("Escape");
    await page.locator(".date-picker-popover").waitFor({ state: "hidden" });
    await page
      .getByRole("combobox", { name: "Task recurrence", exact: true })
      .click();
    await inspect("Recurrence menu", width, '[data-slot="select-content"]');
    await page.keyboard.press("Escape");
    await page
      .locator('[data-slot="select-content"]')
      .waitFor({ state: "hidden" });
    await page
      .getByRole("combobox", { name: "Linked note", exact: true })
      .click();
    await page.getByPlaceholder("Find a note…").fill(target.title);
    await page.getByRole("option").filter({ hasText: target.title }).waitFor();
    await inspect("Note picker", width, ".note-picker-popover");
    await page.keyboard.press("Escape");
    await page.locator(".note-picker-popover").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await openNote(note.id, width);
    await page.getByRole("button", { name: /^Related items/ }).click();
    await page
      .locator(".connection-row")
      .filter({ hasText: target.title })
      .waitFor();
    await inspect("Related items", width);
    await page
      .getByRole("button", { name: "Note actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Version history", exact: true })
      .click();
    await page.getByRole("menu").waitFor({ state: "hidden" });
    await page.locator(".history-preview .bn-editor").waitFor();
    await inspect("History", width, ".history-dialog");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator(".history-dialog").waitFor({ state: "hidden" });
    await nav("Templates", width);
    await page
      .locator(".note-list-item")
      .filter({ hasText: template.title })
      .first()
      .click();
    await page.locator(".bn-editor").waitFor();
    await inspect("Templates", width);
  }
  return {
    theme,
    reports,
    failures: reports.filter(
      (r) =>
        r.overflow ||
        r.nativeSelects ||
        r.smallInputs.length ||
        r.violations.length ||
        r.contained === false,
    ),
  };
}
