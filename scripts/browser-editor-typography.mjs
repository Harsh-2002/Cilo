export default async function verifyEditorTypography(page) {
  const base = new URL(page.url()).origin;
  if (new URL(base).port !== "3004")
    throw new Error("Disposable instance required.");
  const status = await (await page.request.get(`${base}/api/v1/status`)).json();
  if (status.owner?.name !== "Heading Review Owner")
    throw new Error("Heading Review Owner required.");
  const text = (value) => [{ type: "text", text: value, styles: {} }];
  const document = {
    schemaVersion: 1,
    blocks: [
      {
        type: "paragraph",
        content: text("Normal prose should stay compact and readable."),
      },
      ...[1, 2, 3, 4, 5, 6].flatMap((level) => [
        {
          type: "heading",
          props: { level },
          content: text(`Heading ${level}: a calmer writing surface`),
        },
        {
          type: "paragraph",
          content: text(
            "Supporting text with a clear hierarchy and restrained spacing.",
          ),
        },
      ]),
      {
        type: "bulletListItem",
        content: text("A compact list item"),
        children: [
          {
            type: "heading",
            props: { level: 2 },
            content: text("A nested subheading"),
          },
          {
            type: "paragraph",
            content: text("Nested prose remains at the normal body size."),
          },
        ],
      },
      { type: "numberedListItem", content: text("A numbered item") },
      {
        type: "codeBlock",
        props: { language: "text" },
        content: text("const idea = 'clear';"),
      },
    ],
  };
  const response = await page.request.post(`${base}/api/v1/notes`, {
    data: { title: "Editor typography review", document },
  });
  if (!response.ok()) throw new Error("Could not create fixture.");
  const note = await response.json();
  const settings = await page.context().newPage();
  const getNote = async () => {
    try {
      return await (
        await page.request.get(`${base}/api/v1/notes/${note.id}`)
      ).json();
    } catch {
      return await (
        await page.request.get(`${base}/api/v1/notes/${note.id}`)
      ).json();
    }
  };
  const matrix = [];
  let originalZoom;
  try {
    await settings.goto("chrome://settings/appearance");
    originalZoom = await settings.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.settingsPrivate.getDefaultZoom(resolve),
        ),
    );
    for (const zoom of [1, 0.9]) {
      await settings.evaluate(
        (value) =>
          new Promise((resolve) =>
            chrome.settingsPrivate.setDefaultZoom(value, resolve),
          ),
        zoom,
      );
      for (const theme of ["light", "dark"]) {
        const appearance = await page.request.patch(`${base}/api/v1/settings`, {
          data: { theme },
        });
        if (!appearance.ok()) throw new Error("Could not set appearance.");
        for (const width of [1440, 768, 390, 320]) {
          for (const mode of ["standard", "wide"]) {
            const existing = await getNote();
            const updated = await page.request.patch(
              `${base}/api/v1/notes/${note.id}`,
              { data: { revision: existing.revision, editorWidth: mode } },
            );
            if (!updated.ok()) throw new Error("Could not persist page width.");
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`${base}/?note=${note.id}`);
            await page.locator(".bn-editor").waitFor();
            const metrics = await page.evaluate(() => {
              const editor = document.querySelector(".bn-editor");
              const read = (node) => ({
                size: parseFloat(getComputedStyle(node).fontSize),
                weight: getComputedStyle(node).fontWeight,
                line: parseFloat(getComputedStyle(node).lineHeight),
              });
              return {
                mode: document.querySelector(".writing-surface").dataset.width,
                lane: document
                  .querySelector(".writing-surface")
                  .getBoundingClientRect().width,
                available: document.querySelector(".note-scroll").clientWidth,
                titleHeight: document
                  .querySelector(".note-title")
                  .getBoundingClientRect().height,
                ratio: devicePixelRatio,
                width: innerWidth,
                theme: document.documentElement.classList.contains("dark")
                  ? "dark"
                  : "light",
                overflow: document.documentElement.scrollWidth > innerWidth,
                prose: [
                  ...editor.querySelectorAll(
                    '[data-content-type="paragraph"], [data-content-type="bulletListItem"], [data-content-type="numberedListItem"]',
                  ),
                ].map(read),
                code: read(
                  editor.querySelector('[data-content-type="codeBlock"]'),
                ),
                headings: [
                  ...editor.querySelectorAll('[data-content-type="heading"]'),
                ].map((node) => ({
                  level: Number(node.getAttribute("data-level") || 1),
                  ...read(node),
                  inline: read(node.querySelector(".bn-inline-content")),
                })),
              };
            });
            const mobile = metrics.width < 768;
            if (metrics.titleHeight > (mobile ? 120 : 85))
              throw new Error("Note title reserved excess height.");
            const sizes = mobile
              ? [24, 20, 18, 16, 16, 16]
              : [24, 20, 18, 16, 15, 14];
            if (Math.abs(metrics.ratio - zoom) > 0.01)
              throw new Error("Native browser zoom was not applied.");
            if (
              metrics.mode !== mode ||
              (mode === "wide" &&
                Math.abs(metrics.lane - metrics.available) > 1) ||
              (mode === "standard" &&
                metrics.width > 1023 &&
                metrics.lane > 740.1) ||
              metrics.theme !== theme ||
              metrics.overflow
            )
              throw new Error("Theme or viewport mismatch.");
            if (
              metrics.headings.length !== 7 ||
              metrics.headings.some(
                (heading) =>
                  heading.size !== sizes[heading.level - 1] ||
                  heading.inline.size !== heading.size ||
                  heading.weight !== "600" ||
                  heading.inline.weight !== "600" ||
                  Math.abs(heading.line - heading.size * 1.35) > 0.1,
              )
            )
              throw new Error(
                `Heading hierarchy mismatch: ${JSON.stringify(metrics)}`,
              );
            if (
              metrics.prose.some(
                (prose) => prose.size !== (mobile ? 16 : 14),
              ) ||
              metrics.code.size !== 12
            )
              throw new Error("Prose, list or code hierarchy mismatch.");
            await page.screenshot({
              path: `.impeccable/review/headings-${mode}-${width}-${theme}-${zoom * 100}.png`,
              fullPage: true,
            });
            matrix.push({
              mode,
              width,
              theme,
              zoom,
              cssWidth: metrics.width,
              headings: sizes,
              prose: mobile ? 16 : 14,
              code: 12,
            });
          }
        }
      }
    }
    return {
      combinations: matrix.length,
      matrix,
      nativeZoom: true,
      nestedHeadings: true,
    };
  } finally {
    if (originalZoom !== undefined)
      await settings.evaluate(
        (value) =>
          new Promise((resolve) =>
            chrome.settingsPrivate.setDefaultZoom(value, resolve),
          ),
        originalZoom,
      );
    await settings.close();
  }
}
