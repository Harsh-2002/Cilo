export default async function verifyResponsive(page, theme, widths, options) {
  if (new URL(page.url()).port !== "3004")
    throw new Error("Use the disposable review instance.");
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL(page.url()).origin);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
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
  const navigate = async (name, width) => {
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
  const inspect = async (surface, width) => {
    const data = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
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
            (element) =>
              element.getBoundingClientRect().width > 0 &&
              innerWidth < 768 &&
              parseFloat(getComputedStyle(element).fontSize) < 16,
          )
          .map((element) => element.getAttribute("aria-label") || element.id),
        violations: result.violations.map((item) => ({
          id: item.id,
          impact: item.impact,
          targets: item.nodes.map((node) => node.target),
        })),
      };
    });
    reports.push({ theme, width, surface, ...data });
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: `${options.screenshotDir}/audit-final-${theme}-${surface.replaceAll(" ", "-")}-${width}.png`,
      });
  };
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const name of ["Tasks", "Bookmarks", "All notes"]) {
      await navigate(name, width);
      if (name === "All notes")
        await page
          .locator(".note-list-item")
          .filter({ hasText: "Audit rich note" })
          .click();
      await page
        .locator(
          name === "All notes"
            ? ".bn-editor"
            : name === "Tasks"
              ? ".task-list"
              : ".bookmark-grid",
        )
        .waitFor();
      if (name === "Bookmarks")
        await page.locator(".task-skeleton").waitFor({ state: "hidden" });
      await inspect(name, width);
      if (name === "All notes") {
        await page
          .getByRole("combobox", { name: "Code language", exact: true })
          .click();
        const bounds = await page.locator(".language-popover").boundingBox();
        reports.push({
          theme,
          width,
          surface: "Language menu",
          contained:
            bounds.x >= 0 &&
            bounds.x + bounds.width <= width &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= (width === 1440 ? 900 : 844),
        });
        await page.keyboard.press("Escape");
      }
    }
    await navigate("Settings", width);
    for (const tab of ["Appearance", "Account", "Import & export"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await inspect(tab, width);
    }
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  return {
    theme,
    reports,
    failures: reports.filter(
      (item) =>
        item.overflow ||
        item.nativeSelects ||
        item.smallInputs?.length ||
        item.violations?.length ||
        item.contained === false,
    ),
  };
}
