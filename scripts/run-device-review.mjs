import { chromium, webkit, devices, request } from "playwright";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const root = realpathSync(process.argv[2]);
if (!root.startsWith(path.join(tmpdir(), "nivra-capture-review-")))
  throw new Error("Disposable review directory required.");
const base = "http://localhost:3004";
const axeSource = readFileSync(
  new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
  "utf8",
);
const state = path.join(root, "session.json");
const findings = [];
const note = (area, severity, message, detail) =>
  findings.push({ area, severity, message, detail });

// Seed one note with a checklist and audio so the changed controls are audited too.
async function fixture() {
  const api = await request.newContext({
    baseURL: base,
    storageState: state,
    extraHTTPHeaders: { Origin: base },
  });
  const list = await (
    await api.get("/api/nivra/notes?view=all&q=Accessibility%20fixture&limit=5")
  ).json();
  const found = list.find((n) => n.title === "Accessibility fixture");
  if (found) return found.id;
  const created = await (
    await api.post("/api/nivra/notes", {
      data: { title: "Accessibility fixture" },
    })
  ).json();
  const wav = Buffer.alloc(44 + 16000);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + 16000, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(16000, 40);
  const file = await (
    await api.post("/api/nivra/files", {
      multipart: {
        note: created.id,
        file: { name: "tone.wav", mimeType: "audio/wav", buffer: wav },
      },
    })
  ).json();
  const text = (value) => [{ type: "text", text: value, styles: {} }];
  const detail = await (await api.get(`/api/nivra/notes/${created.id}`)).json();
  await api.patch(`/api/nivra/notes/${created.id}`, {
    data: {
      revision: detail.revision,
      document: {
        schemaVersion: 1,
        blocks: [
          {
            id: "h",
            type: "heading",
            props: { level: 2 },
            content: text("Plan"),
            children: [],
          },
          {
            id: "p",
            type: "paragraph",
            content: text("A short paragraph for the audit."),
            children: [],
          },
          {
            id: "c1",
            type: "checkListItem",
            props: { checked: false },
            content: text("Open item"),
            children: [],
          },
          {
            id: "c2",
            type: "checkListItem",
            props: { checked: true },
            content: text("Done item"),
            children: [],
          },
          {
            id: "a",
            type: "audio",
            props: { url: file.url, name: "tone.wav", caption: "A tone" },
            children: [],
          },
        ],
      },
    },
  });
  return created.id;
}

const axeOptions = {
  runOnly: {
    type: "tag",
    values: [
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ],
  },
};
async function audit(page, label, device, scheme, touch = false) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(
    (options) =>
      window.axe.run(document, options).then((r) =>
        r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          target: v.nodes[0]?.target?.join(" "),
        })),
      ),
    axeOptions,
  );
  for (const v of result)
    note(
      `axe ${device} ${scheme} ${label}`,
      v.impact === "critical" || v.impact === "serious" ? "fail" : "warn",
      `${v.id}: ${v.help} (${v.nodes})`,
      v.target,
    );
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const wide = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const style = getComputedStyle(e);
        return (
          r.width > 0 &&
          style.visibility !== "hidden" &&
          r.right > root.clientWidth + 1 &&
          !e.closest(
            "[data-radix-popper-content-wrapper],[data-slot=sheet-content],[role=dialog],.sr-only,[hidden]",
          ) &&
          !(e.closest(".overflow-auto,.overflow-x-auto") && e !== document.body)
        );
      })
      .slice(0, 3)
      .map(
        (e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}`,
      );
    return { overflow: root.scrollWidth - root.clientWidth, wide };
  });
  if (layout.overflow > 1)
    note(
      `layout ${device} ${scheme} ${label}`,
      "fail",
      `page scrolls horizontally by ${layout.overflow}px`,
      layout.wide.join(", "),
    );
  const small = !touch
    ? []
    : await page.evaluate(() => {
        const selector =
          "button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[role=slider],[role=option]";
        const out = [];
        for (const e of document.querySelectorAll(selector)) {
          const r = e.getBoundingClientRect();
          const style = getComputedStyle(e);
          if (
            !r.width ||
            !r.height ||
            style.visibility === "hidden" ||
            style.pointerEvents === "none"
          )
            continue;
          if (
            e.matches("a") &&
            e.closest("p,li,.prose,.bn-inline-content,.note-text")
          )
            continue;
          if (e.closest(".sr-only") || e.disabled) continue;
          // Measure what a finger actually hits: grow from the centre while the point still resolves to this control.
          const owns = (x, y) => {
            const hit = document.elementFromPoint(x, y);
            return (
              !!hit &&
              (hit === e || e.contains(hit) || hit.closest(selector) === e)
            );
          };
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
          const reach = (dx, dy) => {
            let n = 0;
            while (n < 40 && owns(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
            return n;
          };
          const box = {
            width: reach(-1, 0) + reach(1, 0) + 1,
            height: reach(0, -1) + reach(0, 1) + 1,
          };
          if (Math.min(box.width, box.height) < 42)
            out.push(
              `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") || e.textContent || e.className || "").toString().trim().slice(0, 30)}] ${Math.round(box.width)}x${Math.round(box.height)}`,
            );
        }
        return [...new Set(out)];
      });
  if (small.length)
    note(
      `touch ${device} ${scheme} ${label}`,
      "warn",
      `${small.length} controls under 44x44`,
      small.slice(0, 6).join("; "),
    );
}

async function openSection(page, name, mobile) {
  if (mobile) {
    await page.getByRole("button", { name: "Open navigation" }).first().click();
    await page
      .getByRole("button", { name, exact: true })
      .first()
      .waitFor({ state: "visible" });
    await page.waitForTimeout(350);
  }
  await page.getByRole("button", { name, exact: true }).first().click();
  if (mobile)
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await page.waitForTimeout(700);
}

async function deviceRun(engine, profile, scheme, noteId) {
  await setTheme(scheme);
  const browser = await engine.launch(
    engine === chromium ? { channel: "chrome" } : {},
  );
  const device =
    profile === "Desktop"
      ? { viewport: { width: 1440, height: 900 }, hasTouch: false }
      : devices[profile];
  const context = await browser.newContext({
    ...device,
    storageState: state,
    serviceWorkers: "block",
    colorScheme: scheme,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = device.viewport.width < 900;
  const touch = !!device.hasTouch;
  await page.goto(base);
  await page.waitForTimeout(2500);
  await audit(page, "Overview", profile, scheme, touch);
  for (const section of [
    "Tasks",
    "Bookmarks",
    "Notes",
    "Favorites",
    "Templates",
    "Trash",
  ]) {
    await openSection(page, section, mobile);
    await audit(page, section, profile, scheme, touch);
  }
  await openSection(page, "Notes", mobile);
  await page.goto(`${base}/?note=${noteId}`);
  await page.locator(".editor-checklist").first().waitFor();
  await page.locator(".media-player").first().waitFor();
  await audit(page, "Editor with checklist and audio", profile, scheme, touch);
  // tap targets really respond to touch
  const check = page.locator(".editor-checklist").first();
  const before = await check
    .getByRole("checkbox")
    .getAttribute("aria-checked")
    .catch(() => null);
  await page
    .locator(".media-player")
    .first()
    .getByRole("button", { name: /^Play audio$/ })
    [touch ? "tap" : "click"]();
  await page.waitForTimeout(500);
  if (
    await page
      .locator(".media-player audio")
      .evaluate((n) => n.error)
      .catch(() => null)
  )
    note(
      `touch ${profile} ${scheme}`,
      "warn",
      "audio element reported an error on tap",
      "",
    );
  void before;
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    [touch ? "tap" : "click"]()
    .catch(() => {});
  await page.waitForTimeout(600);
  if (await page.getByRole("dialog").count())
    await audit(page, "Settings dialog", profile, scheme, touch);
  if (errors.length)
    note(
      `errors ${profile} ${scheme}`,
      "fail",
      "page errors",
      errors.slice(0, 3).join(" | "),
    );
  await browser.close();
}

async function keyboardRun() {
  await setTheme("light");
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    storageState: state,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForTimeout(2500);
  const describe = () =>
    page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const style = getComputedStyle(e);
      const name =
        e.getAttribute("aria-label") ||
        e.getAttribute("aria-labelledby") ||
        e.innerText ||
        e.getAttribute("title") ||
        e.getAttribute("placeholder") ||
        e.getAttribute("alt") ||
        "";
      const ring =
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== "none" ||
        e.matches(":focus-visible");
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName.toLowerCase(),
        name: String(name).trim().slice(0, 40),
        ring,
        visible:
          r.bottom > 0 &&
          r.top < innerHeight &&
          r.right > 0 &&
          r.left < innerWidth,
      };
    });
  for (const section of ["Overview", "Tasks", "Bookmarks", "Notes"]) {
    await page
      .getByRole("button", { name: section, exact: true })
      .first()
      .click();
    await page.waitForTimeout(700);
    await page
      .locator("body")
      .click({ position: { x: 5, y: 5 } })
      .catch(() => {});
    await page.evaluate(() => document.activeElement?.blur());
    const seen = [];
    let lost = 0;
    for (let i = 0; i < 28; i++) {
      await page.keyboard.press("Tab");
      const info = await describe();
      if (!info) {
        lost++;
        continue;
      }
      seen.push(info);
      if (!info.name)
        note(
          `keyboard ${section}`,
          "fail",
          `focus reached an unnamed ${info.tag}`,
          "",
        );
      if (!info.ring)
        note(
          `keyboard ${section}`,
          "fail",
          `no visible focus on ${info.tag} "${info.name}"`,
          "",
        );
      if (!info.visible)
        note(
          `keyboard ${section}`,
          "warn",
          `focused ${info.tag} "${info.name}" is off screen`,
          "",
        );
    }
    if (seen.length < 8)
      note(
        `keyboard ${section}`,
        "warn",
        `only ${seen.length} tab stops reached`,
        "",
      );
    if (lost > 6)
      note(
        `keyboard ${section}`,
        "warn",
        `focus left the page ${lost} times in 28 tabs`,
        "",
      );
    for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+Tab");
    if (!(await describe()))
      note(`keyboard ${section}`, "warn", "Shift+Tab lost focus", "");
  }
  // search palette and quick capture: opening moves focus in, Escape closes and returns focus
  for (const [name, open] of [
    ["Search palette", () => page.keyboard.press("Control+k")],
    [
      "Quick capture",
      () =>
        page
          .getByRole("button", { name: /^Capture/ })
          .first()
          .focus()
          .then(() => page.keyboard.press("Enter")),
    ],
  ]) {
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Notes", exact: true })
      .first()
      .focus();
    const opener = await page.evaluate(() =>
      document.activeElement?.textContent?.trim().slice(0, 20),
    );
    await open();
    await page.waitForTimeout(500);
    const inside = await page.evaluate(
      () => !!document.activeElement?.closest("[role=dialog]"),
    );
    if (!inside)
      note(
        `keyboard ${name}`,
        "fail",
        "focus did not move into the dialog",
        "",
      );
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      if (
        !(await page.evaluate(
          () => !!document.activeElement?.closest("[role=dialog]"),
        ))
      ) {
        note(
          `keyboard ${name}`,
          "fail",
          "focus escaped the dialog while tabbing",
          "",
        );
        break;
      }
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    if (await page.getByRole("dialog").count())
      note(`keyboard ${name}`, "fail", "Escape did not close the dialog", "");
    const after = await page.evaluate(() =>
      document.activeElement?.textContent?.trim().slice(0, 20),
    );
    if (name === "Search palette" && after !== opener && !(await describe()))
      note(
        `keyboard ${name}`,
        "warn",
        "focus was not restored after closing",
        `${opener} -> ${after}`,
      );
  }
  await browser.close();
}

async function pwaRun() {
  await setTheme("light");
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    storageState: state,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await page.goto(base);
  await page.waitForTimeout(3000);
  const manifest = await session.send("Page.getAppManifest");
  if (manifest.errors?.length)
    note("pwa", "fail", "manifest errors", JSON.stringify(manifest.errors));
  const parsed = JSON.parse(manifest.data || "{}");
  for (const field of [
    "name",
    "short_name",
    "start_url",
    "display",
    "icons",
    "theme_color",
    "background_color",
  ])
    if (!parsed[field]) note("pwa", "fail", `manifest missing ${field}`, "");
  if (parsed.display !== "standalone")
    note("pwa", "warn", `display is ${parsed.display}`, "");
  if (!(parsed.icons || []).some((i) => i.purpose === "maskable"))
    note("pwa", "warn", "no maskable icon", "");
  const installability = await session.send("Page.getInstallabilityErrors");
  for (const e of installability.installabilityErrors || [])
    note(
      "pwa",
      "warn",
      `installability: ${e.errorId}`,
      JSON.stringify(e.errorArguments),
    );
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.ready.catch(() => null);
    return reg ? { scope: reg.scope, state: reg.active?.state } : null;
  });
  if (!registered) note("pwa", "fail", "service worker did not register", "");
  await page.reload();
  await page.waitForTimeout(1500);
  // generate traffic that must never be cached: private pages, API data and media
  await page
    .getByRole("button", { name: "Tasks", exact: true })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page.goto(
    `${base}/?note=${(await (await context.request.get(`${base}/api/nivra/notes?view=all&limit=1`)).json())[0].id}`,
  );
  await page.waitForTimeout(1500);
  const entries = await page.evaluate(async () => {
    const out = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys())
        out.push(`${key} ${new URL(request.url).pathname}`);
    }
    return out;
  });
  const allowed = /(\/offline\.html|\/icon\.svg|\/icons\/|\/_next\/static\/)/;
  for (const entry of entries)
    if (!allowed.test(entry.split(" ")[1]))
      note(
        "pwa",
        "fail",
        "private or unexpected URL in a service-worker cache",
        entry,
      );
  note(
    "pwa",
    "info",
    `${entries.length} cached entries, all static: ${entries.every((e) => allowed.test(e.split(" ")[1]))}`,
    "",
  );
  // offline behavior
  await context.setOffline(true);
  await page.goto(base).catch(() => {});
  await page.waitForTimeout(800);
  const offlineText = await page.evaluate(() =>
    document.body.innerText.slice(0, 300),
  );
  if (!/offline/i.test(offlineText))
    note(
      "pwa",
      "fail",
      "offline navigation did not show the offline page",
      offlineText.slice(0, 120),
    );
  if (/Review nebula|Research note|Capture/.test(offlineText))
    note("pwa", "fail", "offline page exposed private content", "");
  await audit(page, "Offline page", "desktop", "light");
  await context.setOffline(false);
  await page.goto(base);
  await page.waitForTimeout(1500);
  if (!(await page.getByRole("button", { name: "Tasks", exact: true }).count()))
    note("pwa", "fail", "app did not recover after going back online", "");
  // standalone display mode renders without layout problems
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "display-mode", value: "standalone" }],
  });
  await page.reload();
  await page.waitForTimeout(2000);
  const standalone = await page.evaluate(
    () => matchMedia("(display-mode: standalone)").matches,
  );
  if (!standalone)
    note("pwa", "warn", "could not emulate standalone display mode", "");
  await audit(page, "Standalone mode", "desktop", "light");
  // cache growth: every build adds new hashed assets that are never evicted
  const count = await page.evaluate(
    async () => (await (await caches.open("nivra-static-v1")).keys()).length,
  );
  note("pwa", "info", `nivra-static-v1 holds ${count} entries`, "");
  await browser.close();
}

async function setTheme(theme) {
  const api = await request.newContext({
    baseURL: base,
    storageState: state,
    extraHTTPHeaders: { Origin: base },
  });
  const response = await api.patch("/api/nivra/settings", { data: { theme } });
  if (!response.ok()) throw new Error(`Could not set the ${theme} theme`);
}
const noteId = await fixture();
const which = process.argv.slice(3);
const run = (name) => !which.length || which.includes(name);
if (run("devices") || which.includes("iphone")) {
  for (const [engine, profile, scheme] of [
    [chromium, "Desktop", "light"],
    [chromium, "Desktop", "dark"],
    [webkit, "iPhone 13", "light"],
    [webkit, "iPhone 13", "dark"],
    [chromium, "Pixel 7", "light"],
    [chromium, "Pixel 7", "dark"],
    [webkit, "iPad (gen 7)", "light"],
    [webkit, "iPad (gen 7)", "dark"],
  ]
    .filter(
      ([, profile]) =>
        !process.env.DEVICE_FILTER ||
        new RegExp(process.env.DEVICE_FILTER).test(profile),
    )
    .filter(
      ([, profile, scheme]) =>
        !which.includes("iphone") ||
        (profile === "iPhone 13" && scheme === "light"),
    )) {
    console.error(`device ${profile} ${scheme}`);
    await deviceRun(engine, profile, scheme, noteId).catch((e) =>
      note(
        `device ${profile} ${scheme}`,
        "fail",
        "run aborted",
        e.message.slice(0, 200),
      ),
    );
  }
}
if (run("keyboard"))
  await keyboardRun().catch((e) =>
    note("keyboard", "fail", "run aborted", e.message.slice(0, 200)),
  );
if (run("pwa"))
  await pwaRun().catch((e) =>
    note("pwa", "fail", "run aborted", e.message.slice(0, 200)),
  );
writeFileSync(
  path.join(root, "device-review.json"),
  JSON.stringify(findings, null, 2),
);
const by = (s) => findings.filter((f) => f.severity === s);
console.log(
  JSON.stringify({
    fail: by("fail").length,
    warn: by("warn").length,
    info: by("info").length,
  }),
);
for (const f of [...by("fail"), ...by("warn"), ...by("info")])
  console.log(
    `${f.severity.toUpperCase()} [${f.area}] ${f.message}${f.detail ? " :: " + f.detail : ""}`,
  );
