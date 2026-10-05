import { chromium, firefox, webkit, request } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const root = realpathSync(process.argv[2]);
assert.ok(root.startsWith("/tmp/nivra-controls-review-"));
const base = "http://localhost:3004";
const text = (value) => [{ type: "text", text: value, styles: {} }];
if (process.argv.includes("--setup")) {
  const api = await request.newContext({
    baseURL: base,
    extraHTTPHeaders: { Origin: base },
  });
  const status = await (await api.get("/api/nivra/status")).json();
  assert.equal(
    status.setup,
    true,
    "Only a fresh disposable instance can be seeded",
  );
  const result = await api.post("/api/nivra/setup", {
    data: {
      name: "Controls Review Owner",
      username: "ControlsReviewOwner",
      password: randomBytes(24).toString("hex"),
      theme: "light",
    },
  });
  assert.ok(result.ok());
  const note = await (
    await api.post("/api/nivra/notes", {
      data: { title: "A quiet place for recordings" },
    })
  ).json();
  const files = [];
  for (const [name, mimeType] of [
    ["recording.wav", "audio/wav"],
    ["clip.mp4", "video/mp4"],
  ]) {
    const response = await api.post("/api/nivra/files", {
      multipart: {
        note: note.id,
        file: { name, mimeType, buffer: readFileSync(path.join(root, name)) },
      },
    });
    assert.ok(response.ok());
    files.push(await response.json());
  }
  const document = {
    schemaVersion: 1,
    blocks: [
      {
        id: "intro",
        type: "paragraph",
        content: text(
          "Keep the words, the checklist, and the recording together.",
        ),
        children: [],
      },
      {
        id: "check-one",
        type: "checkListItem",
        props: { checked: false },
        content: text("Review the recording"),
        children: [],
      },
      {
        id: "check-two",
        type: "checkListItem",
        props: { checked: true },
        content: text("Save a copy"),
        children: [
          {
            id: "nested",
            type: "paragraph",
            content: text("A nested reminder"),
            children: [],
          },
        ],
      },
      ...files.map((file, index) => ({
        id: `media-${index}`,
        type: index ? "video" : "audio",
        props: {
          url: file.url,
          name: index
            ? "A recording with a deliberately very long filename for narrow screens.mp4"
            : "A recording with a deliberately very long filename for narrow screens.wav",
          caption: index
            ? "A moment in the garden"
            : "An eight-second recording",
          showPreview: true,
          previewWidth: 512,
        },
        children: [],
      })),
      {
        id: "legacy-diagram",
        type: "diagram",
        props: {},
        content: text("graph TD\n  A[Capture] --> B[Keep]"),
        children: [],
      },
      {
        id: "last",
        type: "paragraph",
        content: text("Try a block"),
        children: [],
      },
    ],
  };
  const saved = await (
    await api.patch(`/api/nivra/notes/${note.id}`, {
      data: { revision: note.revision, document },
    })
  ).json();
  const published = await (
    await api.post(`/api/nivra/notes/${note.id}/publication`, {
      data: { revision: saved.revision },
    })
  ).json();
  assert.ok(published.token);
  writeFileSync(
    path.join(root, "fixtures.json"),
    JSON.stringify({ noteId: note.id, token: published.token, files }),
    { mode: 0o600 },
  );
  await api.storageState({ path: path.join(root, "session.json") });
  await api.dispose();
  console.log("Disposable controls fixtures created");
  process.exit(0);
}
const fixtures = JSON.parse(
  readFileSync(path.join(root, "fixtures.json"), "utf8"),
);
mkdirSync(".impeccable/review", { recursive: true });
const results = [];
for (const engine of process.argv.slice(3).filter((v) => !v.startsWith("--"))
  .length
  ? process.argv.slice(3).filter((v) => !v.startsWith("--"))
  : ["chromium", "firefox", "webkit"]) {
  const browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    ...(engine === "chromium" ? { channel: "chrome" } : {}),
  });
  try {
    const context = await browser.newContext({
      storageState: path.join(root, "session.json"),
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    let navigating = false;
    page.on("pageerror", (e) => {
      // WebKit rejects fetches cancelled by a navigation this harness started.
      if (navigating && e.message.endsWith("due to access control checks."))
        return;
      errors.push(e.message);
    });
    for (const method of ["goto", "reload"]) {
      const original = page[method].bind(page);
      page[method] = async (...args) => {
        navigating = true;
        try {
          return await original(...args);
        } finally {
          navigating = false;
        }
      };
    }
    await page.goto(base);
    const status = await (
      await page.request.get(`${base}/api/nivra/status`)
    ).json();
    assert.equal(status.owner?.name, "Controls Review Owner");
    const initial = await (
      await page.request.get(`${base}/api/nivra/notes/${fixtures.noteId}`)
    ).json();
    const originalIds = new Set([
      "intro",
      "check-one",
      "check-two",
      "media-0",
      "media-1",
      "legacy-diagram",
      "last",
    ]);
    const blocks = initial.document.blocks
      .filter((block) => originalIds.has(block.id))
      .map((block) =>
        block.id === "check-one"
          ? { ...block, props: { ...block.props, checked: false } }
          : block.id === "last"
            ? { ...block, content: text("Try a block") }
            : block,
      );
    assert.equal(blocks.length, originalIds.size);
    assert.ok(
      (
        await page.request.patch(`${base}/api/nivra/notes/${fixtures.noteId}`, {
          headers: { Origin: base },
          data: {
            revision: initial.revision,
            document: { schemaVersion: 1, blocks },
          },
        })
      ).ok(),
    );

    const matrix = [];
    for (const theme of ["light", "dark"]) {
      assert.ok(
        (
          await page.request.patch(`${base}/api/nivra/settings`, {
            data: { theme },
            headers: { Origin: base },
          })
        ).ok(),
      );
      for (const width of engine === "chromium"
        ? [1440, 768, 390, 320]
        : [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const view of ["editor", "reader"]) {
          await page.goto(
            view === "editor"
              ? `${base}/?note=${fixtures.noteId}`
              : `${base}/share/${fixtures.token}`,
          );
          await page.locator(".media-player").first().waitFor();
          await page.locator(".media-player").last().scrollIntoViewIfNeeded();
          await page.evaluate(() => document.fonts.ready);
          await assertEventually(async () =>
            page
              .locator("audio,video")
              .evaluateAll((nodes) =>
                nodes.every(
                  (node) => Number.isFinite(node.duration) && node.duration > 0,
                ),
              ),
          );
          await assertEventually(async () =>
            page
              .getByRole("slider", { name: "Playback position" })
              .evaluateAll((nodes) =>
                nodes.every(
                  (node) => Number(node.getAttribute("aria-valuemax")) > 1,
                ),
              ),
          );
          await page.waitForTimeout(250);
          const metrics = await page
            .locator(".media-player")
            .evaluateAll((nodes) =>
              nodes.map((node) => ({
                width: node.clientWidth,
                overflow: node.scrollWidth > node.clientWidth + 1,
                buttons: [...node.querySelectorAll("button")].map((b) => ({
                  h: b.getBoundingClientRect().height,
                  w: b.getBoundingClientRect().width,
                })),
                native: !!node.querySelector(
                  "[controls],select,input[type=range]",
                ),
              })),
            );
          assert.equal(metrics.length, 2);
          assert.ok(metrics.every((m) => !m.overflow && !m.native));
          if (width < 768)
            assert.ok(
              metrics.every((m) =>
                m.buttons.every((b) => b.h >= 44 && b.w >= 44),
              ),
            );
          assert.equal(
            await page.locator('input[type="checkbox"]:visible').count(),
            0,
          );
          if (view === "editor" && width < 768) {
            const targets = await page
              .locator('.editor-check [data-slot="checkbox"]')
              .evaluateAll((nodes) =>
                nodes.map((node) => {
                  const r = node.getBoundingClientRect();
                  const style = getComputedStyle(node, "::after");
                  return {
                    w:
                      r.width -
                      parseFloat(style.left) -
                      parseFloat(style.right),
                    h:
                      r.height -
                      parseFloat(style.top) -
                      parseFloat(style.bottom),
                    row: node
                      .closest(".editor-checklist")
                      .getBoundingClientRect().height,
                  };
                }),
              );
            assert.ok(
              targets.every(
                (target) =>
                  target.w >= 44 && target.h >= 44 && target.row >= 44,
              ),
            );
          }
          assert.ok(
            await page
              .locator(".note-scroll, .public-note")
              .evaluateAll((nodes) =>
                nodes.every((node) => node.scrollWidth <= node.clientWidth + 1),
              ),
          );
          await page.screenshot({
            path: `.impeccable/review/controls-${engine}-${view}-${theme}-${width}.png`,
            fullPage: true,
          });
          matrix.push({ theme, width, view, overflow: false });
        }
      }
    }
    console.log(`${engine}: layout matrix complete`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/?note=${fixtures.noteId}`);
    const checkbox = page
      .locator('[data-id="check-one"]')
      .getByRole("checkbox");
    await checkbox.waitFor();
    const before = await checkbox.getAttribute("aria-checked");
    await checkbox.focus();
    const focus = await checkbox.evaluate((node) => ({
      outline: getComputedStyle(node).outlineStyle,
      shadow: getComputedStyle(node).boxShadow,
    }));
    assert.equal(focus.outline, "none");
    assert.equal(focus.shadow, "none");
    await page.keyboard.press("Space");
    await assertEventually(
      async () =>
        (
          await (
            await page.request.get(`${base}/api/nivra/notes/${fixtures.noteId}`)
          ).json()
        ).document.blocks.find((b) => b.id === "check-one").props.checked ===
        (before !== "true"),
    );
    await page.reload();
    await checkbox.waitFor();
    assert.equal(
      await checkbox.getAttribute("aria-checked"),
      before === "true" ? "false" : "true",
    );
    await page.locator('[data-id="last"] .bn-inline-content').click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page.getByRole("option", { name: /Drawing/ }).waitFor();
    assert.equal(
      await page.getByRole("option", { name: /Diagram/i }).count(),
      0,
    );
    await page.keyboard.press("Escape");
    assert.ok(await page.locator('[data-id="legacy-diagram"]').count());
    for (const view of ["editor", "reader"]) {
      await page.goto(
        view === "editor"
          ? `${base}/?note=${fixtures.noteId}`
          : `${base}/share/${fixtures.token}`,
      );
      for (const kind of ["audio", "video"]) {
        const player = page.locator(`.media-${kind}`);
        await player.waitFor();
        await player.scrollIntoViewIfNeeded();
        await player
          .getByRole("button", { name: `Play ${kind}`, exact: true })
          .click();
        await assertEventually(async () =>
          player
            .locator(kind)
            .evaluate((node) => !node.paused && node.currentTime > 0.1),
        );
        await player
          .getByRole("button", { name: `Pause ${kind}`, exact: true })
          .click();
        const beforeSeek = await player
          .locator(kind)
          .evaluate((node) => node.currentTime);
        await player.getByRole("slider", { name: "Playback position" }).focus();
        await page.keyboard.press("ArrowRight");
        assert.ok(
          await player
            .locator(kind)
            .evaluate(
              (node, previous) => node.currentTime > previous,
              beforeSeek,
            ),
        );
        await player
          .getByRole("button", { name: "Volume", exact: true })
          .click();
        await page.getByRole("button", { name: "Mute", exact: true }).click();
        assert.ok(await player.locator(kind).evaluate((node) => node.muted));
        await page.getByRole("slider", { name: "Volume level" }).focus();
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await assertEventually(async () =>
          player
            .locator(kind)
            .evaluate(
              (node) => !node.muted && node.volume > 0 && node.volume < 1,
            ),
        );
        await page.keyboard.press("Escape");
        await page
          .getByRole("slider", { name: "Volume level" })
          .waitFor({ state: "hidden" });
        assert.equal(
          await page.getByRole("slider", { name: "Volume level" }).count(),
          0,
        );
        if (
          kind === "video" &&
          (await player
            .getByRole("button", { name: "Fullscreen", exact: true })
            .count())
        ) {
          await player
            .getByRole("button", { name: "Fullscreen", exact: true })
            .click();
          await assertEventually(async () =>
            page.evaluate(() => !!document.fullscreenElement),
          );
          await player
            .getByRole("button", { name: "Exit fullscreen", exact: true })
            .click();
        }
      }
    }
    await page.goto(`${base}/?note=${fixtures.noteId}`);
    await page.locator(".editor-checklist").first().waitFor();
    await page
      .getByRole("button", { name: "Note actions", exact: true })
      .click();
    const markdownRequest = page.waitForRequest(
      (r) => r.url().includes("/export/markdown/") && r.method() === "POST",
    );
    await page
      .getByRole("menuitem", { name: "Export Markdown package", exact: true })
      .click();
    const exported = (await markdownRequest).postDataJSON().markdown;
    await page
      .getByRole("menuitem", { name: "Export Markdown package", exact: true })
      .waitFor({ state: "hidden" });
    await page.waitForTimeout(150);
    assert.match(exported, /\[x\] Save a copy/);
    assert.match(exported, /\[[ x]\] Review the recording/);
    const beforeEnter = (
      await (
        await page.request.get(`${base}/api/nivra/notes/${fixtures.noteId}`)
      ).json()
    ).document.blocks.filter((b) => b.type === "checkListItem").length;
    const checklistText = page.locator(
      '[data-id="check-one"] .bn-inline-content',
    );
    // Radix restores focus to the menu trigger after closing, so click until the editor holds it.
    for (let attempt = 0; ; attempt++) {
      await checklistText.click();
      if (
        await page.evaluate(() => document.activeElement?.closest(".bn-editor"))
      )
        break;
      assert.ok(attempt < 5, "Editor did not receive focus");
      await page.waitForTimeout(100);
    }
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await assertEventually(
      async () =>
        (
          await (
            await page.request.get(`${base}/api/nivra/notes/${fixtures.noteId}`)
          ).json()
        ).document.blocks.filter((b) => b.type === "checkListItem").length >
        beforeEnter,
    );
    await page.keyboard.type("Another checklist item");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("tab", { name: "Import & export", exact: true })
      .click();
    await page
      .locator('input[type="file"][multiple]:not([webkitdirectory])')
      .setInputFiles({
        name: `Checklist import ${engine}.md`,
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# Imported checklist\n\n- [x] Imported complete\n- [ ] Imported open",
        ),
      });
    await page
      .getByRole("button", { name: "Import 1 file", exact: true })
      .click();
    await assertEventually(async () => {
      const listing = await (
        await page.request.get(`${base}/api/nivra/notes?view=all`)
      ).json();
      const notes = Array.isArray(listing) ? listing : listing.items;
      const item = notes.find((n) => n.title === `Checklist import ${engine}`);
      if (!item) return false;
      const note = await (
        await page.request.get(`${base}/api/nivra/notes/${item.id}`)
      ).json();
      const checks = note.document.blocks.filter(
        (b) => b.type === "checkListItem",
      );
      return (
        checks.length === 2 &&
        checks[0].props.checked === true &&
        checks[1].props.checked === false
      );
    });
    await page.getByText("1 note imported.", { exact: true }).waitFor();
    console.log(`${engine}: checklist and Markdown complete`);
    await page.goto(`${base}/share/${fixtures.token}`);
    const publicAudio = await page.locator("audio").getAttribute("src");
    let injectedFailures = 0;
    // WebKit media loads bypass Playwright routing, so it uses a real server 404.
    const missingAudio = publicAudio.replace(/[^/]+$/, randomUUID());
    if (engine === "webkit") {
      assert.equal(
        (await page.request.get(`${base}${missingAudio}`)).status(),
        404,
      );
    } else {
      await page.route(`**${publicAudio}*`, (route) => {
        injectedFailures++;
        return route.fulfill({ status: 503, body: "Unavailable" });
      });
    }
    await page.reload();
    const failedPlayer = page.locator(".media-audio");
    await failedPlayer.locator("audio").evaluate(
      (node, missing) => {
        node.src = missing ?? `${node.src}?reviewFailure=${Date.now()}`;
        node.load();
      },
      engine === "webkit" ? missingAudio : null,
    );
    await failedPlayer.getByRole("alert").waitFor();
    if (engine === "webkit") {
      if (
        await failedPlayer
          .locator("audio")
          .evaluate(
            (node, missing) => !!node.error && node.src.endsWith(missing),
            missingAudio,
          )
      )
        injectedFailures++;
    } else {
      const failuresBeforeRetry = injectedFailures;
      await failedPlayer
        .getByRole("button", { name: "Retry audio", exact: true })
        .click();
      await assertEventually(
        async () => injectedFailures > failuresBeforeRetry,
      );
      await failedPlayer
        .getByRole("button", { name: "Retry audio", exact: true })
        .waitFor();
      await failedPlayer.getByRole("alert").waitFor();
    }
    assert.ok(
      injectedFailures > 0,
      "Fault injection reached the media request",
    );
    await failedPlayer.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.impeccable/review/controls-${engine}-failure.png`,
      fullPage: true,
    });
    assert.ok(
      await failedPlayer
        .getByRole("link", { name: "Open file", exact: true })
        .count(),
    );
    await page.unroute(`**${publicAudio}*`);
    await failedPlayer
      .getByRole("button", { name: "Retry audio", exact: true })
      .click();
    await assertEventually(async () =>
      failedPlayer
        .locator("audio")
        .evaluate((node) => !node.paused && node.currentTime > 0),
    );
    await failedPlayer.locator("audio").evaluate((node) => {
      node.currentTime = node.duration - 0.2;
    });
    await failedPlayer
      .getByRole("button", { name: "Play audio", exact: true })
      .waitFor();
    const anonymous = await browser.newContext({ javaScriptEnabled: false });
    const reader = await anonymous.newPage();
    await reader.goto(`${base}/share/${fixtures.token}`);
    assert.ok(
      await reader.getByText("Keep the words", { exact: false }).count(),
    );
    assert.equal(await reader.locator("noscript a").count(), 2);
    assert.equal(
      (await anonymous.request.get(`${base}${fixtures.files[0].url}`)).status(),
      401,
    );
    await anonymous.close();
    assert.deepEqual(errors, []);
    results.push({
      engine,
      matrix,
      checklistPersists: true,
      playback: true,
      keyboard: true,
      preservedDiagram: true,
      markdownRoundTrip: true,
      failureRetry: true,
      noScript: true,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        engine,
        failed: true,
        error: e.message,
        stack: e.stack,
      }),
    );
    process.exitCode = 1;
    break;
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(results, null, 2));
async function assertEventually(check) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail("Expected state did not arrive");
}
