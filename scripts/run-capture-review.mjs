import { chromium, firefox, webkit } from "playwright";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import verifyCaptureRetrieval from "./browser-capture-retrieval.mjs";

const root = realpathSync(process.argv[2]);
if (!root.startsWith(path.join(tmpdir(), "cilo-capture-review-")))
  throw new Error("Disposable directory required.");
const fixtures = JSON.parse(
  readFileSync(path.join(root, "fixtures.json"), "utf8"),
);
const engines = process.argv.slice(3);
const output = [];
for (const engine of engines.length
  ? engines
  : ["chromium", "firefox", "webkit"]) {
  const browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    ...(engine === "chromium" ? { channel: "chrome" } : {}),
  });
  try {
    const context = await browser.newContext({
      storageState: path.join(root, "session.json"),
      serviceWorkers: "block",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3004");
    output.push(await verifyCaptureRetrieval(page, { engine, fixtures }));
  } catch (error) {
    console.error(
      JSON.stringify({
        engine,
        failed: true,
        error: error.message,
        stack: error.stack,
      }),
    );
    process.exitCode = 1;
    break;
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(output, null, 2));
