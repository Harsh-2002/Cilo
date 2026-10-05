export default async function verifyMinimalReader(page) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Disposable instance required.");
  const status = await (
    await page.request.get(`${base}/api/nivra/status`)
  ).json();
  if (status.owner?.name !== "Review Owner")
    throw new Error("Disposable Review Owner required.");
  await page.setViewportSize({ width: 1440, height: 900 });
  const passed = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    passed.push(name);
  };
  const api = async (path, method = "GET", data) => {
    const response = await page.request.fetch(`${base}/api/nivra/${path}`, {
      method,
      data,
    });
    if (!response.ok())
      throw new Error(`Fixture request: ${path} ${response.status()}`);
    return response.json();
  };
  const errors = [];
  const consoleListener = (message) => {
    if (message.type() === "error") errors.push(message.text());
  };
  page.on("console", consoleListener);
  const text = (value) => [{ type: "text", text: value, styles: {} }];
  const note = await api("notes", "POST", {
    title: "A quiet reader",
    document: {
      schemaVersion: 1,
      blocks: [
        {
          type: "paragraph",
          content: text("Readable before JavaScript. A shared thought."),
        },
        { type: "heading", props: { level: 2 }, content: text("Details") },
        { type: "bulletListItem", content: text("A first item") },
        { type: "bulletListItem", content: text("A second item") },
        {
          type: "checkListItem",
          props: { checked: true },
          content: text("Complete"),
        },
        {
          type: "table",
          content: {
            type: "tableContent",
            headerRows: 1,
            rows: [
              { cells: [text("Name"), text("Value")] },
              { cells: [text("Clarity"), text("Yes")] },
            ],
          },
        },
        {
          type: "codeBlock",
          props: { language: "typescript" },
          content: text("const thought: string = 'clear';"),
        },
        {
          type: "diagram",
          content: text("graph LR\n A[Thought] --> B[Note]"),
        },
      ],
    },
  });
  const publication = await api(`notes/${note.id}/publication`, "POST", {
    revision: note.revision,
  });
  await api("tasks", "POST", { title: "A quiet reader task" });
  await page.goto(base);
  await page.locator(".overview-tasks:not(.overview-skeleton)").waitFor();
  check(
    (await page
      .getByText("Your day, at a glance.", { exact: true })
      .count()) === 0,
    "Overview headline removed",
  );
  const nav = page.getByRole("navigation", { name: "Notes navigation" });
  check(
    (await nav.getByRole("button").allTextContents()).join(",") ===
      "Overview,Favorites,Notes,Journal,Tasks,Bookmarks,Templates,Trash",
    "Navigation order and single-word labels",
  );
  check(
    (await page.locator(".overview-panel > header").count()) === 0,
    "Overview header removed",
  );
  check(
    (await page
      .locator(".account-button, .avatar, .note-footer, .list-footer")
      .count()) === 0,
    "No avatar or bottom status bars",
  );
  await nav.getByRole("button", { name: "Journal", exact: true }).click();
  await page.locator(".bn-editor").waitFor();
  const journalId = await page
    .locator("[data-note-id]")
    .getAttribute("data-note-id");
  check((await api(`notes/${journalId}`)).text === "", "Journal starts blank");
  check(
    (await page.locator(".editor-insert-tools").count()) === 0,
    "No persistent insert toolbar",
  );
  const timings = [];
  for (let index = 0; index < 3; index++) {
    timings.push(
      await page.evaluate(async () => {
        const start = performance.now();
        document.querySelector('button[aria-label="Search"]').click();
        await new Promise((resolve) => {
          const paint = () =>
            document.querySelector('[role="dialog"] [role="combobox"]')
              ? requestAnimationFrame(resolve)
              : requestAnimationFrame(paint);
          requestAnimationFrame(paint);
        });
        return performance.now() - start;
      }),
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("dialog")
    .evaluate(async (element) =>
      Promise.all(
        element
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  await page.route("**/api/nivra/search?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  const input = page.getByRole("combobox");
  const searchResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/nivra/search?q=quiet"),
  );
  await input.fill("quiet");
  const pending = await page.getByRole("dialog").boundingBox();
  await searchResponse;
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-slot="command-list"]')
        ?.getAttribute("aria-busy") === "false",
  );
  await page
    .getByRole("option", { name: /A quiet reader task/ })
    .first()
    .waitFor();
  const settled = await page.getByRole("dialog").boundingBox();
  check(
    Math.abs(pending.y - settled.y) < 1 &&
      Math.abs(pending.height - settled.height) < 1,
    "Search loading and results preserve dialog bounds",
  );
  check(
    (await page.getByRole("option", { name: /A quiet reader task/ }).count()) >=
      1 &&
      (await page
        .getByRole("option", { name: /A quiet reader.*Readable/ })
        .count()) >= 1,
    "Global search finds notes and tasks",
  );
  await page.unrouteAll({ behavior: "wait" });
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  for (const width of [1440, 768, 390, 320]) {
    for (const theme of ["light", "dark"]) {
      await api("settings", "PATCH", { theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await page.locator(".overview-tasks:not(.overview-skeleton)").waitFor();
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overview fits ${width}px ${theme}`,
      );
      await page.screenshot({
        path: `.impeccable/review/overview-${width}-${theme}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox").waitFor();
      await page
        .getByRole("dialog")
        .evaluate(async (element) =>
          Promise.all(
            element
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          ),
        );
      const bounds = await page.getByRole("dialog").boundingBox();
      check(
        bounds.x >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y >= 0 &&
          bounds.y + bounds.height <= 900,
        `Search fits ${width}px ${theme}`,
      );
      await page.screenshot({
        path: `.impeccable/review/search-${width}-${theme}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
    }
  }
  const publicURL = `${base}/share/${publication.token}`;
  const html = await page.request.get(publicURL);
  check(
    html.status() === 200 &&
      (await html.text()).includes("Readable before JavaScript."),
    "Published body is in initial HTML",
  );
  check(
    html.headers()["cache-control"].includes("no-store") &&
      html.headers()["content-security-policy"].includes("object-src 'none'"),
    "Published response is uncached with scoped CSP",
  );
  const context = await page
    .context()
    .browser()
    .newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
  const reader = await context.newPage();
  await reader.goto(publicURL);
  check(
    (await reader
      .getByRole("heading", { name: "A quiet reader", exact: true })
      .isVisible()) &&
      (await reader
        .getByRole("cell", { name: "Clarity", exact: true })
        .isVisible()),
    "Anonymous reader renders without JavaScript",
  );
  check(
    (await reader
      .locator(".bn-container, .publication-brand, .publication-footer")
      .count()) === 0,
    "Reader has no editor or branding",
  );
  await context.close();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(publicURL);
  await page.locator(".reader-diagram svg").waitFor();
  check(
    (await page.locator(".reader-diagram svg").textContent()).includes(
      "Thought",
    ),
    "Diagram labels remain visible after sanitization",
  );
  await page.locator(".reader-code code > span").first().waitFor();
  check(
    true,
    "Code highlighting and sanitized diagram enhance the public reader",
  );
  await page.screenshot({
    path: ".impeccable/review/reader-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/reader-mobile.png",
    fullPage: true,
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Published reader fits mobile",
  );
  const missing = await page.goto(`${base}/missing-review-page`);
  check(missing.status() === 404, "Unknown route returns HTTP 404");
  await page.getByRole("link", { name: "Back to workspace" }).waitFor();
  await page.screenshot({
    path: ".impeccable/review/not-found-mobile.png",
    fullPage: true,
  });
  await api(`notes/${note.id}/publication`, "DELETE");
  check(
    (await page.request.get(publicURL)).status() === 404,
    "Revoked publication returns HTTP 404 immediately",
  );
  check(
    !errors.some((error) =>
      /Encountered a script tag|hydration|Content Security Policy|Refused to/i.test(
        error,
      ),
    ),
    "No script-remount, hydration or CSP errors",
  );
  page.off("console", consoleListener);
  await page.goto(base);
  return {
    passed,
    clickToPaintMs: timings,
    searchShiftPx: Math.abs(pending.y - settled.y),
    consoleErrors: errors.filter((error) => !error.includes("404")),
  };
}
