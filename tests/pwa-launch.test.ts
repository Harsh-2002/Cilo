import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { launchImages } from "../src/lib/pwa.mjs";
import manifest from "../src/app/manifest";

test("PWA launch assets exist at their declared sizes and include both themes and orientations", async () => {
  const urls = new Set<string>();
  for (const image of launchImages) {
    assert.ok(!urls.has(image.url));
    urls.add(image.url);
    const asset = `public${image.url.split("?")[0]}`;
    const metadata = await sharp(asset).metadata();
    assert.equal(metadata.width, image.width);
    assert.equal(metadata.height, image.height);
    assert.equal(metadata.format, "png");
  }
  for (const theme of ["light", "dark"]) {
    for (const orientation of ["portrait", "landscape"]) {
      const image = launchImages.find((entry) =>
        entry.url.includes(`390-844-3-${orientation}-${theme}`),
      )!;
      assert.ok(image);
      const pixel = await sharp(`public${image.url.split("?")[0]}`)
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      assert.deepEqual([...pixel], Array(3).fill(theme === "dark" ? 17 : 255));
    }
  }
  const app = manifest();
  assert.equal(app.display, "standalone");
  assert.ok(app.icons?.some((icon) => icon.sizes === "512x512"));
  assert.match(app.description!, /thoughts, plans/);
});
