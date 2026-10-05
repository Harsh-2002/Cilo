export default async function verifyOverview(page, phase, options = {}) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Use the disposable review instance on port 3004.");
  const api = async (path, method = "GET", data) => {
    const response = await page.request.fetch(`${base}/api/nivra/${path}`, {
      method,
      data,
    });
    if (!response.ok())
      throw new Error(`Fixture request failed: ${path} (${response.status()})`);
    return response.json();
  };
  if ((await api("status")).owner?.name !== "Review Owner")
    throw new Error("Use the disposable Review Owner.");
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  const overview = page.getByRole("region", { name: "Overview", exact: true });
  const ready = () =>
    overview
      .locator(".overview-tasks:not(.overview-skeleton)")
      .first()
      .waitFor();
  const passed = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    passed.push(name);
  };
  const navigation = page.getByRole("navigation", { name: "Notes navigation" });
  const back = async () => {
    await navigation
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await ready();
  };
  await ready();
  if (phase === "functional") {
    check(
      (await navigation.getByRole("button").first().innerText()) === "Overview",
      "Overview is the first navigation section",
    );
    check(
      await overview.isVisible(),
      "Overview is the default landing section",
    );
    check(
      (await overview.getByLabel("Today's date").getAttribute("datetime"))
        .length === 10,
      "Full local date and year are present",
    );
    check(
      (await overview.getByLabel("Current time").innerText()).length > 0,
      "Local clock is displayed",
    );
    check(
      await overview
        .getByText("A thought, an idea, a place to start.")
        .isVisible(),
      "Empty notes teach the creation action",
    );
    check(
      await overview
        .getByText("Keep something worth coming back to.")
        .isVisible(),
      "Empty bookmarks teach the save action",
    );
    check(
      await overview
        .getByText("Nothing left open. Make room for your next task.")
        .isVisible(),
      "Empty tasks offer a creation action",
    );
    const stamp = Date.now();
    const title = `Overview scheduled ${stamp}`;
    const date = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const task = await api("tasks", "POST", {
      title,
      dueDate: date,
      recurrence: "daily",
    });
    const note = await api("notes", "POST", {
      title: `Overview thought ${stamp}`,
    });
    const bookmark = await api("bookmarks", "POST", {
      url: `https://example.com/?overview=${stamp}`,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await overview
      .getByRole("checkbox", { name: `Complete ${title}`, exact: true })
      .waitFor();
    check(true, "Refresh shows externally created workspace items");
    await overview
      .getByRole("checkbox", { name: `Complete ${title}`, exact: true })
      .click();
    await page
      .getByText("Task completed. Next occurrence created.", { exact: true })
      .waitFor();
    const tasks = await api("tasks");
    check(
      tasks.some((t) => t.parentTaskId === task.id && !t.completedAt),
      "Inline completion creates the recurring successor",
    );
    check(
      tasks.find((t) => t.id === task.id).completedAt !== null,
      "Inline completion persists",
    );
    const link = overview.locator(`a[href="${bookmark.url}"]`);
    check(
      (await link.getAttribute("target")) === "_blank" &&
        (await link.getAttribute("rel")).includes("noopener"),
      "Bookmark quick access is a safe external link",
    );
    await overview
      .getByRole("button", { name: new RegExp(note.title) })
      .click();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Note title", exact: true })
        .inputValue()) === note.title,
      "Recent note opens the exact note",
    );
    await back();
    await overview
      .getByRole("button", { name: "View all tasks", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Search tasks", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Search tasks", exact: true })
        .inputValue()) === "",
      "View all tasks clears previous search targets",
    );
    await back();
    await overview
      .locator(".overview-task-link")
      .filter({ hasText: title })
      .click();
    await page
      .getByRole("textbox", { name: "Search tasks", exact: true })
      .waitFor();
    check(
      (await page
        .getByRole("textbox", { name: "Search tasks", exact: true })
        .inputValue()) === title,
      "Task quick access locates the selected task",
    );
    await back();
    await overview
      .getByRole("button", { name: "Add task", exact: true })
      .click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "New task",
    );
    check(true, "Add task focuses the existing creation field");
    await back();
    await overview
      .getByRole("button", { name: "Save link", exact: true })
      .click();
    await page.waitForFunction(
      () => document.activeElement?.id === "bookmark-url",
    );
    check(true, "Save link focuses the existing URL field");
    await back();
    await overview
      .getByRole("button", { name: "Journal", exact: true })
      .click();
    await page.getByText("Journal", { exact: false }).waitFor();
    check(true, "Today's note opens the daily note");
    await back();
    await overview
      .getByRole("button", { name: "New note", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .waitFor();
    check(true, "New note opens the editor");
    await back();
    await page.keyboard.press("Control+k");
    await page
      .getByRole("combobox", { name: "Search everything", exact: true })
      .waitFor();
    check(true, "Unified search works from Overview");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.route("**/api/nivra/overview?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Test server unavailable" }),
      }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await overview.getByRole("alert").waitFor();
    check(
      await overview.getByText("Recent notes", { exact: true }).isVisible(),
      "Refresh failure keeps the last snapshot visible",
    );
    await page.unroute("**/api/nivra/overview?*");
    await overview
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await overview.getByRole("alert").waitFor({ state: "hidden" });
    check(true, "Retry recovers the failed refresh");
    await page.reload();
    await ready();
    check(
      await overview.isVisible(),
      "Reload returns to Overview with persisted items",
    );
  } else if (phase === "polling") {
    const note = await api("notes", "POST", {
      title: `Live overview ${Date.now()}`,
    });
    await overview
      .getByRole("button", { name: new RegExp(note.title) })
      .waitFor({ timeout: 35000 });
    check(
      true,
      "Visible Overview automatically refreshes external changes within 30 seconds",
    );
  } else if (phase === "hidden") {
    let requests = 0;
    const listener = (request) => {
      if (request.url().includes("/api/nivra/overview?")) requests++;
    };
    page.on("request", listener);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(31000);
    check(requests === 0, "Hidden tabs stop summary polling");
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await overview.locator(".overview-tasks:not(.overview-skeleton)").waitFor();
    await page.waitForTimeout(200);
    check(requests > 0, "Returning to the tab refreshes immediately");
    page.off("request", listener);
  } else if (phase === "responsive") {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", {
        name: options.theme === "dark" ? "Dark" : "Light",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.addScriptTag({ path: options.axePath });
    for (const width of options.widths || [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.waitForTimeout(250);
      const report = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        gridColumns: getComputedStyle(
          document.querySelector(".overview-grid"),
        ).gridTemplateColumns.split(" ").length,
        smallCompletionTargets:
          innerWidth < 768
            ? [...document.querySelectorAll(".overview-check > button")].filter(
                (e) => {
                  const hit = getComputedStyle(e, "::after");
                  return (
                    e.getBoundingClientRect().height -
                      parseFloat(hit.top) -
                      parseFloat(hit.bottom) <
                    44
                  );
                },
              ).length
            : 0,
        violations: (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
        nativeSelects: [...document.querySelectorAll("select")].filter(
          (e) =>
            e.getBoundingClientRect().width > 1 &&
            getComputedStyle(e).opacity !== "0",
        ).length,
      }));
      check(
        !report.overflow &&
          !report.nativeSelects &&
          !report.violations.length &&
          !report.smallCompletionTargets &&
          report.gridColumns === (width < 1024 ? 1 : 2),
        `${options.theme} ${width}px layout and accessibility: ${JSON.stringify(report)}`,
      );
      await overview
        .locator(".overview-scroll")
        .evaluate((e) => (e.scrollTop = 0));
      await page.screenshot({
        path: `${options.captureDirectory}/overview-${options.theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  return { phase, passed };
}
