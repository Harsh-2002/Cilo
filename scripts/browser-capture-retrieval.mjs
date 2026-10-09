export default async function verifyCaptureRetrieval(
  page,
  { engine, fixtures, screenshots = true },
) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Disposable instance required.");
  const status = await (await page.request.get(`${base}/api/v1/status`)).json();
  if (status.owner?.name !== "Capture Review Owner")
    throw new Error("Disposable review owner required.");
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const errors = [];
  let quietUntil = 0;
  page.on("pageerror", (error) => {
    // WebKit rejects fetches cancelled by a navigation this harness started.
    if (
      Date.now() < quietUntil &&
      error.message.endsWith("due to access control checks.")
    )
      return;
    errors.push(error.message);
  });
  for (const method of ["goto", "reload"]) {
    const original = page[method].bind(page);
    page[method] = async (...args) => {
      quietUntil = Infinity;
      try {
        return await original(...args);
      } finally {
        quietUntil = Date.now() + 500;
      }
    };
  }
  const capture = () =>
    page.getByRole("dialog", { name: "Quick", exact: true });
  const input = () => capture().getByRole("textbox", { name: "Quick text" });
  const search = () =>
    page.getByRole("dialog", { name: "Search Nivra", exact: true });
  const ready = async () => {
    await page.getByRole("button", { name: "Add task", exact: true }).waitFor();
  };
  const openCapture = async () => {
    await page.keyboard.press("Control+Shift+Enter");
    await input().waitFor();
  };
  const submit = async (label) => {
    await capture().getByRole("button", { name: label, exact: true }).click();
    await capture().waitFor({ state: "hidden" });
  };
  const matrix = [];
  for (const theme of ["light", "dark"]) {
    check(
      (
        await page.request.patch(`${base}/api/v1/settings`, {
          data: { theme },
        })
      ).ok(),
      "Theme update failed",
    );
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await ready();
      await openCapture();
      await input().fill(
        "A thought worth keeping\nCapture stays quiet and close to the current work.",
      );
      const metrics = await capture().evaluate((node) => {
        const r = node.getBoundingClientRect();
        const input = node.querySelector("textarea");
        return {
          x: r.x,
          right: r.right,
          y: r.y,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          overflow: node.scrollWidth > node.clientWidth,
          inputSize: parseFloat(getComputedStyle(input).fontSize),
          buttons: [...node.querySelectorAll("button")].map((button) => ({
            label: button.textContent.trim(),
            w: button.getBoundingClientRect().width,
            h: button.getBoundingClientRect().height,
          })),
        };
      });
      check(
        metrics.x >= 0 &&
          metrics.right <= width &&
          metrics.y >= 0 &&
          metrics.bottom <= 900 &&
          !metrics.overflow,
        "Capture overflow",
      );
      check(
        metrics.inputSize === (width < 768 ? 16 : 14),
        "Capture input typography",
      );
      if (width < 768)
        check(
          metrics.buttons.every((button) => button.h >= 44 && button.w >= 44),
          "Capture touch targets",
        );
      if (screenshots)
        await page.screenshot({
          path: `.impeccable/review/capture-${engine}-${width}-${theme}.png`,
          animations: "disabled",
        });
      await page.keyboard.press("Escape");
      await capture().waitFor({ state: "hidden" });
      await openCapture();
      check(
        (await input().inputValue()) ===
          "A thought worth keeping\nCapture stays quiet and close to the current work.",
        "Dismissed draft lost",
      );
      await input().fill("");
      await page.keyboard.press("Escape");
      await capture().waitFor({ state: "hidden" });
      matrix.push({ viewport: width, theme, ...metrics });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await ready();
  await openCapture();
  await input().fill("Capture recovery fixture");
  await page.route("**/api/v1/notes", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Saving is temporarily unavailable." }),
        })
      : route.continue(),
  );
  await capture()
    .getByRole("button", { name: "Save note", exact: true })
    .click();
  await capture().getByRole("alert").waitFor();
  check(
    (await input().inputValue()) === "Capture recovery fixture",
    "Failed capture lost draft",
  );
  if (screenshots)
    await page.screenshot({
      path: `.impeccable/review/capture-error-${engine}.png`,
      animations: "disabled",
    });
  await page.unroute("**/api/v1/notes");
  await submit("Save note");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New task", exact: true })
    .fill("Unfinished inline task draft");
  await openCapture();
  await capture().getByRole("button", { name: "Task", exact: true }).click();
  await input().fill("Captured task fixture");
  await submit("Save task");
  check(
    (await page
      .getByRole("textbox", { name: "New task", exact: true })
      .inputValue()) === "Unfinished inline task draft",
    "Capture discarded task draft",
  );
  await page.getByRole("textbox", { name: "New task", exact: true }).fill("");
  const tasks = await (
    await page.request.get(`${base}/api/v1/tasks?q=Captured%20task%20fixture`)
  ).json();
  check(
    tasks.items.some((task) => task.title === "Captured task fixture"),
    "Captured task missing",
  );
  await openCapture();
  const linkURL = `http://127.0.0.1/capture-fixture-${engine}-${Date.now()}`;
  await input().fill(linkURL);
  await submit("Save link");
  const bookmarks = await (
    await page.request.get(`${base}/api/v1/bookmarks`)
  ).json();
  check(
    bookmarks.items.some(
      (bookmark) =>
        bookmark.url === linkURL && bookmark.metadataStatus === "unavailable",
    ),
    "Safe fallback bookmark missing",
  );
  await page.goto(`${base}/?note=${fixtures.otherId}`);
  await page
    .getByRole("textbox", { name: "Note title", exact: true })
    .waitFor();
  await page.route("**/api/v1/notes/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Saving is temporarily unavailable." }),
        })
      : route.continue(),
  );
  await page
    .getByRole("textbox", { name: "Note title", exact: true })
    .fill("An unfinished title stays here");
  await openCapture();
  await input().fill("Capture beside an unfinished note");
  await submit("Save note");
  check(
    (await page
      .getByRole("textbox", { name: "Note title", exact: true })
      .inputValue()) === "An unfinished title stays here",
    "Capture discarded note edits",
  );
  check(
    (await page.locator(".note-pane").getAttribute("data-note-id")) ===
      fixtures.otherId,
    "Capture navigated away from note",
  );
  await page.unroute("**/api/v1/notes/*");
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  if (await retry.isVisible()) await retry.click();
  await page.locator(".save-status.saved").waitFor();
  await page.keyboard.press("Control+k");
  await search().waitFor();
  const query = search().getByRole("combobox", { name: "Search everything" });
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/v1/search?q=aurora") && r.ok(),
  );
  const start = Date.now();
  await query.fill("aurora");
  await response;
  const result = search()
    .getByRole("option")
    .filter({ hasText: "Buried context fixture" });
  await result.waitFor();
  const searchMs = Date.now() - start;
  check(
    (await result.locator("mark").filter({ hasText: "aurora" }).count()) >= 1,
    "Search match not highlighted",
  );
  check(
    (await result.innerText()).includes("milestone"),
    "Matching passage missing",
  );
  if (screenshots)
    await page.screenshot({
      path: `.impeccable/review/search-context-${engine}.png`,
      animations: "disabled",
    });
  await result.click();
  await search().waitFor({ state: "hidden" });
  await page
    .locator(`.editor-root [data-id="${fixtures.blockId}"]`)
    .first()
    .waitFor();
  await page.waitForFunction((id) => {
    const node = document.querySelector(`.editor-root [data-id="${id}"]`);
    const scroll = document.querySelector(".note-scroll");
    if (!node || !scroll) return false;
    const n = node.getBoundingClientRect(),
      s = scroll.getBoundingClientRect();
    return n.top >= s.top && n.bottom <= s.bottom;
  }, fixtures.blockId);
  if (screenshots)
    await page.screenshot({
      path: `.impeccable/review/search-target-${engine}.png`,
      animations: "disabled",
    });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => {
      const title = document.querySelector(".note-title");
      if (!title) return false;
      const height = title.getBoundingClientRect().height;
      const line = parseFloat(getComputedStyle(title).lineHeight);
      return height >= line - 1 && height <= line * 3 + 1;
    });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Quick", exact: true }).click();
  await input().waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Quick text",
  );
  await page.setViewportSize({ width: 390, height: 320 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector(".quick-capture-dialog");
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return rect.y >= 0 && rect.bottom <= window.innerHeight;
  });
  const shortBox = await capture().boundingBox();
  check(
    shortBox.y >= 0 && shortBox.y + shortBox.height <= 320,
    "Short viewport capture overflow",
  );
  await capture()
    .getByRole("button", { name: "Save note", exact: true })
    .scrollIntoViewIfNeeded();
  const saveBox = await capture()
    .getByRole("button", { name: "Save note", exact: true })
    .boundingBox();
  check(
    saveBox.y >= shortBox.y &&
      saveBox.y + saveBox.height <= shortBox.y + shortBox.height,
    "Short viewport save unreachable",
  );
  await page.keyboard.press("Escape");
  await capture().waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await ready();
  await page
    .getByRole("button", { name: "View all notes", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".note-list-item").length === 60,
  );
  check(
    (await page.locator(".note-count").innerText()) === "60+",
    "Paged count misleading",
  );
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".note-list-item").length === 120,
  );
  check(
    await page.locator(".note-list-item").evaluateAll((nodes) => {
      const research = nodes
        .map((node) => node.textContent)
        .filter((text) => text.startsWith("Research note "));
      return new Set(research).size === research.length;
    }),
    "Duplicate note rows",
  );
  const listSizes = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (
      response.request().method() === "GET" &&
      /^\/api\/v1\/(tasks|bookmarks)$/.test(url.pathname)
    )
      listSizes.push(
        (await response.body().catch(() => Buffer.alloc(0))).length,
      );
  });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".task-row").length === 60,
  );
  check(
    /^Open\s*\d{4,}/.test(
      await page
        .locator(".task-filters")
        .getByRole("button", { name: /^Open/ })
        .innerText(),
    ),
    "Task count did not come from the complete library",
  );
  await page
    .getByRole("button", { name: "Load more tasks", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".task-row").length === 120,
  );
  const openBefore = Number(
    (
      await page
        .locator(".task-filters")
        .getByRole("button", { name: /^Open/ })
        .innerText()
    ).replace(/\D/g, ""),
  );
  const firstTask = page.locator(".task-row").first();
  const firstTitle = await firstTask
    .locator(".task-title, p, span")
    .first()
    .innerText();
  await firstTask.getByRole("checkbox").click();
  await page.waitForFunction(
    (count) =>
      Number(
        [...document.querySelectorAll(".task-filters button")]
          .find((b) => /^Open/.test(b.textContent || ""))
          ?.textContent?.replace(/\D/g, ""),
      ) === count,
    openBefore - 1,
  );
  check(
    !(await page.locator(".task-row").first().innerText()).includes(firstTitle),
    "Completed task stayed in the open list",
  );
  await page
    .getByRole("button", { name: "Load more tasks", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".task-row").length >= 119,
  );
  check(
    await page.locator(".task-row").evaluateAll((rows) => {
      const text = rows.map((row) => row.textContent);
      return new Set(text).size === text.length;
    }),
    "Duplicate task rows after completing between pages",
  );
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("task 4999 ");
  await page.waitForFunction(
    () => document.querySelectorAll(".task-row").length === 1,
  );
  await page
    .getByRole("textbox", { name: "Search tasks", exact: true })
    .fill("");
  await page.waitForFunction(
    () => document.querySelectorAll(".task-row").length === 60,
  );
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".bookmark-card").length === 60,
  );
  check(
    /\b[5-9]\d{3,}\s+bookmarks\b/.test(
      await page.locator(".task-summary").innerText(),
    ),
    "Bookmark total did not come from the complete library",
  );
  await page
    .getByRole("button", { name: "Load more bookmarks", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".bookmark-card").length === 120,
  );
  await page
    .getByRole("textbox", { name: "Search bookmarks", exact: true })
    .fill("Nebula reference 4999");
  await page.waitForFunction(
    () => document.querySelectorAll(".bookmark-card").length === 1,
  );
  check(
    listSizes.length >= 4 && listSizes.every((size) => size < 150_000),
    `List responses were not bounded: ${listSizes.join(",")}`,
  );
  await page.evaluate(() => {
    window.__shifts = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__shifts += entry.value;
      }).observe({ type: "layout-shift", buffered: false });
    } catch {}
  });
  const firstRow = () =>
    page.evaluate(
      () =>
        document.querySelector(".task-row,.bookmark-card,.note-list-item")
          ?.textContent || "",
    );
  let previous = "";
  for (const section of [
    "Tasks",
    "Bookmarks",
    "Templates",
    "Trash",
    "Favorites",
    "Notes",
    "Tasks",
    "Notes",
  ]) {
    await page.evaluate(() => (window.__shifts = 0));
    await page
      .getByRole("button", { name: section, exact: true })
      .first()
      .click();
    await page.waitForTimeout(20);
    const early = await firstRow();
    await page.waitForTimeout(900);
    const settled = await firstRow();
    check(
      !early || early === settled,
      `${section} briefly showed another section's rows: "${early.slice(0, 40)}" then "${settled.slice(0, 40)}"`,
    );
    check(
      !previous || !settled || settled !== previous,
      `${section} still shows the previous section's rows`,
    );
    check(
      (await page.evaluate(() => window.__shifts)) < 0.02,
      `${section} layout shifted while loading`,
    );
    previous = settled;
  }
  await page.reload();
  const saved = await (
    await page.request.get(
      `${base}/api/v1/search?q=Capture%20recovery%20fixture`,
    )
  ).json();
  check(
    saved.some((item) => item.title === "Capture recovery fixture"),
    "Capture missing after reload",
  );
  check(errors.length === 0, `Browser errors: ${errors.join(",")}`);
  return {
    engine,
    combinations: matrix.length,
    matrix,
    searchMs,
    captureRecovery: true,
    draftsPreserved: true,
    bookmarkFallback: true,
    blockTarget: true,
    incrementalLists: true,
    mobileNoteAction: true,
    shortViewport: true,
    titleSizing: true,
    pageErrors: errors,
  };
}
