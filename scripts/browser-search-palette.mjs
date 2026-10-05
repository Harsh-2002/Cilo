export default async function verifySearchPalette(page) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Disposable instance required.");
  const status = await (
    await page.request.get(`${base}/api/cilo/status`)
  ).json();
  if (status.owner?.name !== "Search Review Owner")
    throw new Error("Search Review Owner required.");
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const errors = [];
  const listener = (error) => errors.push(error.name);
  page.on("pageerror", listener);
  const dialog = () =>
    page.getByRole("dialog", { name: "Search Cilo", exact: true });
  const input = () =>
    dialog().getByRole("combobox", { name: "Search everything" });
  const open = async () => {
    await page.getByRole("button", { name: "Add task", exact: true }).waitFor();
    await page.keyboard.press("Control+k");
    await input().waitFor();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-slot="command-list"]')
          .getAttribute("aria-busy") === "false",
    );
  };
  const matrix = [];
  try {
    for (const theme of ["light", "dark"]) {
      const response = await page.request.patch(`${base}/api/cilo/settings`, {
        data: { theme },
      });
      check(response.ok(), "Theme update failed");
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base);
        await open();
        const metrics = await dialog().evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const wrapper = node.querySelector(
            '[data-slot="command-input-wrapper"]',
          );
          const input = node.querySelector('[data-slot="command-input"]');
          const buttons = [...node.querySelectorAll("button")].map(
            (button) => ({
              label:
                button.getAttribute("aria-label") || button.textContent.trim(),
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
            }),
          );
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
            windowWidth: innerWidth,
            windowHeight: innerHeight,
            inputSize: parseFloat(getComputedStyle(input).fontSize),
            inputShadow: getComputedStyle(input).boxShadow,
            inputOutline: getComputedStyle(input).outlineStyle,
            inputBackground: getComputedStyle(wrapper).backgroundColor,
            overflow: node.scrollWidth > node.clientWidth,
            buttons,
          };
        });
        check(
          metrics.x >= 0 &&
            metrics.right <= metrics.windowWidth &&
            metrics.y >= 0 &&
            metrics.bottom <= metrics.windowHeight &&
            !metrics.overflow,
          "Dialog overflow",
        );
        check(
          metrics.width <= 560.1 && metrics.height < 460,
          "Palette size mismatch",
        );
        check(
          metrics.inputSize === (width < 768 ? 16 : 14),
          "Input typography mismatch",
        );
        check(
          metrics.inputBackground === "rgba(0, 0, 0, 0)" &&
            metrics.inputShadow === "none" &&
            metrics.inputOutline === "none",
          "Input surface or focus mismatch",
        );
        if (width < 768)
          check(
            metrics.buttons.every(
              (button) => button.width >= 44 && button.height >= 44,
            ),
            "Mobile close/filter hit target",
          );
        await page.screenshot({
          path: `.impeccable/review/search-palette-${width}-${theme}.png`,
          animations: "disabled",
        });
        await page
          .getByRole("button", { name: "Search filters", exact: true })
          .click();
        await page
          .getByText("Combine a filter with your search.", { exact: true })
          .waitFor();
        check(
          await page.getByText("type:bookmark", { exact: true }).isVisible(),
          "Bookmark filter discoverability",
        );
        if (width === 320)
          await page.screenshot({
            path: `.impeccable/review/search-filters-320-${theme}.png`,
            animations: "disabled",
          });
        await page.keyboard.press("Escape");
        await page
          .getByText("Combine a filter with your search.", { exact: true })
          .waitFor({ state: "hidden" });
        check(
          await dialog().isVisible(),
          "Escape from nested filter help closed search",
        );
        await input().click();
        await page.keyboard.press("Escape");
        await dialog().waitFor({ state: "hidden" });
        matrix.push({ width, theme, ...metrics });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await open();
    await input().fill("type:task garden");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-slot="command-list"]')
          .getAttribute("aria-busy") === "false",
    );
    check(
      (await dialog()
        .getByRole("option")
        .filter({ hasText: "Garden: order seeds" })
        .count()) === 1,
      "Task filter results",
    );
    await input().fill("unfindablexyz");
    await page
      .getByText("No matching items. Try another word or filter.", {
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: ".impeccable/review/search-palette-empty.png",
      animations: "disabled",
    });
    await input().fill("");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-slot="command-list"]')
          .getAttribute("aria-busy") === "false",
    );
    const before = await dialog().boundingBox();
    await page.route("**/api/cilo/search?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await input().fill("garden");
    const during = await dialog().boundingBox();
    check(
      await dialog().getByRole("option").first().isDisabled(),
      "Stale results selectable while loading",
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-slot="command-list"]')
          .getAttribute("aria-busy") === "false",
    );
    const after = await dialog().boundingBox();
    check(
      ["x", "y", "width", "height"].every(
        (key) => before[key] === during[key] && during[key] === after[key],
      ),
      "Search loading layout shift",
    );
    await page.unroute("**/api/cilo/search?*");
    await page.route("**/api/cilo/search?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Search is temporarily unavailable." }),
      }),
    );
    await input().fill("recovery");
    await dialog().getByRole("alert").waitFor();
    await page.screenshot({
      path: ".impeccable/review/search-palette-error.png",
      animations: "disabled",
    });
    await page.unroute("**/api/cilo/search?*");
    await input().fill("garden");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-slot="command-list"]')
          .getAttribute("aria-busy") === "false",
    );
    check(
      (await dialog().getByRole("alert").count()) === 0,
      "Error recovery failed",
    );
    await page.keyboard.press("ArrowDown");
    check(
      await input().getAttribute("aria-activedescendant"),
      "Keyboard active result missing",
    );
    await page.keyboard.press("Enter");
    await dialog().waitFor({ state: "hidden" });
    check(errors.length === 0, `Browser errors: ${errors.join(",")}`);
    return {
      combinations: matrix.length,
      matrix,
      loadingShift: 0,
      filters: true,
      empty: true,
      errorRecovery: true,
      keyboardSelection: true,
      pageErrors: errors,
    };
  } finally {
    await page.unroute("**/api/cilo/search?*");
    page.off("pageerror", listener);
  }
}
