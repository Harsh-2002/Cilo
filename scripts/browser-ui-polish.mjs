export default async function verifyInterface(page) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Use the disposable review instance.");
  const status = await (await page.request.get(`${base}/api/v1/status`)).json();
  if (status.owner?.name !== "Review Owner")
    throw new Error("Review Owner required.");
  const passed = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    passed.push(name);
  };
  const dismiss = async () => {
    await page.keyboard.press("Escape");
    await page
      .locator(
        '[data-slot="dialog-content"], [data-slot="dropdown-menu-content"], [data-slot="select-content"]',
      )
      .waitFor({ state: "hidden" });
  };
  const nav = async (name) => {
    const button = page.getByRole("button", { name, exact: true });
    if (page.viewportSize().width < 1024) {
      const back = page.getByRole("button", {
        name: "Back to notes",
        exact: true,
      });
      if (await back.isVisible()) await back.click();
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    }
    await button.click();
  };
  const menu = async (label) => {
    const locator = page.locator(
      '[data-slot="dropdown-menu-content"], [data-slot="select-content"]',
    );
    await locator.waitFor();
    await locator.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const info = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        viewport: innerWidth,
        items: [
          ...element.querySelectorAll('[role="menuitem"], [role="option"]'),
        ].map((item) => ({
          nowrap: getComputedStyle(item).whiteSpace === "nowrap",
          clipped: item.scrollWidth > item.clientWidth + 1,
          touchSize:
            item.getBoundingClientRect().height >= (innerWidth < 768 ? 44 : 36),
        })),
      };
    });
    check(
      info.left >= 0 && info.right <= info.viewport,
      `${label} fits viewport`,
    );
    check(
      info.items.every(
        (item) => item.nowrap && !item.clipped && item.touchSize,
      ),
      `${label} has single-line labels`,
    );
  };
  for (const width of [1440, 768, 390, 320])
    for (const theme of ["light", "dark"]) {
      const context = `${width}px ${theme}`;
      const appearance = await page.request.patch(`${base}/api/v1/settings`, {
        data: { theme },
      });
      if (!appearance.ok()) throw new Error("Could not set review theme.");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await page.locator(".overview-tasks:not(.overview-skeleton)").waitFor();
      check(
        await page.evaluate(
          (value) => document.documentElement.classList.contains(value),
          theme,
        ),
        `Theme applied ${context}`,
      );
      check(
        !(await page.locator(".overview-updated").count()),
        `No refresh copy ${context}`,
      );
      await nav("Search");
      const search = page.getByRole("combobox");
      await search.fill("neubla");
      await page.locator(".search-result-type").first().waitFor();
      check(
        (await page.locator(".search-result-type").allTextContents())
          .sort()
          .join(",") === "bookmark,note,task",
        `Global typo search ${context}`,
      );
      check(
        await search.evaluate(
          (element) =>
            getComputedStyle(element).outlineStyle === "none" &&
            getComputedStyle(element).boxShadow === "none",
        ),
        `Search focus ${context}`,
      );
      const rect = await page.getByRole("dialog").boundingBox();
      check(
        rect.x >= 0 && rect.x + rect.width <= width,
        `Search fits ${context}`,
      );
      await page.screenshot({
        path: `/tmp/nivra-ui-refinement/search-${width}-${theme}.png`,
      });
      await dismiss();
      await nav("Bookmarks");
      await page
        .getByRole("button", {
          name: "Actions for Nebula reference",
          exact: true,
        })
        .click();
      await menu(`Bookmark menu ${context}`);
      await page.screenshot({
        path: `/tmp/nivra-ui-refinement/bookmark-menu-${width}-${theme}.png`,
      });
      await dismiss();
      await page
        .getByRole("combobox", { name: "Filter bookmark collection" })
        .click();
      await menu(`Collection selector ${context}`);
      await dismiss();
      await nav("Tasks");
      await page
        .getByRole("button", { name: "Actions for Review nebula", exact: true })
        .click();
      await menu(`Task menu ${context}`);
      await dismiss();
      await nav("Notes");
      await page
        .getByRole("button", { name: "Nebula research", exact: false })
        .first()
        .click();
      await page.getByRole("button", { name: "Note actions" }).click();
      await menu(`Note menu ${context}`);
      await page.screenshot({
        path: `/tmp/nivra-ui-refinement/note-menu-${width}-${theme}.png`,
      });
      await dismiss();
      if (width < 1024) {
        const back = page.getByRole("button", {
          name: "Back to notes",
          exact: true,
        });
        if (await back.isVisible()) await back.click();
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      }
      check(
        !(await page
          .locator(".navigation-footer")
          .getByText("Review Owner", { exact: true })
          .count()),
        `Quiet account footer ${context}`,
      );
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("tab", { name: "Account", exact: true }).click();
      const input = page.getByRole("textbox", { name: "Name", exact: true });
      await input.click();
      check(
        await input.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.outlineStyle === "none" &&
            style.boxShadow === "none" &&
            style.borderTopWidth === "1px"
          );
        }),
        `Single input focus border ${context}`,
      );
      check(
        (await page
          .getByRole("button", { name: "Sign out", exact: true })
          .isVisible()) &&
          (await page
            .getByRole("button", { name: "Sign out others", exact: true })
            .isVisible()),
        `Distinct session actions ${context}`,
      );
      await page.screenshot({
        path: `/tmp/nivra-ui-refinement/settings-${width}-${theme}.png`,
      });
      await dismiss();
    }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unable to sign out right now." }),
    }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Unable to sign out right now." })
    .waitFor();
  const retained = await (
    await page.request.get(`${base}/api/v1/status`)
  ).json();
  check(
    Boolean(retained.owner),
    "Failed sign-out preserves session and shows error",
  );
  await page.unroute("**/api/auth/sign-out");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  check(true, "Settings sign-out returns to login");
  const ended = await (await page.request.get(`${base}/api/v1/status`)).json();
  check(!ended.owner, "Sign-out invalidates server session");
  return { checks: passed.length, passed };
}
