import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { recognize, shutdownEngine } from "../src/lib/server/ocr-engine";

test("OCR reads sideways and upside-down images within the shared deadline", async (t) => {
  try {
    for (const angle of [90, 180, 270, "exif"]) {
      await t.test(`${angle} oriented image`, async () => {
        const bytes = await readFile(
          `tests/fixtures/ocr-${angle}.${angle === "exif" ? "jpg" : "png"}`,
        );
        const text = await recognize(bytes);
        assert.match(text, /Northwind/i);
        assert.match(text, /Invoice/i);
        assert.match(text, /Quarterly/i);
        assert.match(text, /Total due/i);
        assert.match(text, /workspace=api/i);
      });
    }
  } finally {
    await shutdownEngine();
  }
});
