import { test } from "node:test";
import assert from "node:assert/strict";
import { fileResponse, memorySource } from "../src/lib/server/file-response";
const data = Uint8Array.from([0, 1, 2, 3, 4, 5]);
const file = { mime: "audio/wav", name: "Recording.wav" };
test("media byte ranges support seeking and retain safe private headers", async () => {
  for (const [range, expected, contentRange] of [
    ["bytes=1-3", [1, 2, 3], "bytes 1-3/6"],
    ["bytes=4-", [4, 5], "bytes 4-5/6"],
    ["bytes=-2", [4, 5], "bytes 4-5/6"],
    ["bytes=0-99", [0, 1, 2, 3, 4, 5], "bytes 0-5/6"],
  ] as const) {
    const response = await fileResponse(
      new Request("https://nivra.test/file", { headers: { Range: range } }),
      memorySource(data),
      file,
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), contentRange);
    assert.equal(
      response.headers.get("Content-Length"),
      String(expected.length),
    );
    assert.equal(response.headers.get("Content-Type"), "audio/wav");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(
      [...new Uint8Array(await response.arrayBuffer())],
      [...expected],
    );
  }
});
test("invalid ranges and active documents cannot bypass file response protections", async () => {
  for (const range of [
    "bytes=8-",
    "bytes=4-2",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,3-4",
    "bytes=99999999999999999999-",
    "items=0-1",
  ]) {
    const response = await fileResponse(
      new Request("https://nivra.test/file", { headers: { Range: range } }),
      memorySource(data),
      file,
    );
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("Content-Range"), "bytes */6");
  }
  const response = await fileResponse(
    new Request("https://nivra.test/file"),
    memorySource(data),
    { mime: "text/html", name: "active.html" },
    true,
  );
  assert.equal(
    response.headers.get("Content-Type"),
    "application/octet-stream",
  );
  assert.match(response.headers.get("Content-Disposition")!, /^attachment/);
  assert.equal(
    response.headers.get("Content-Security-Policy"),
    "default-src 'none'; sandbox",
  );
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const conditional = await fileResponse(
    new Request("https://nivra.test/file", {
      headers: { Range: "bytes=0-1", "If-Range": '"unknown"' },
    }),
    memorySource(data),
    file,
  );
  assert.equal(conditional.status, 200);
  assert.equal((await conditional.arrayBuffer()).byteLength, 6);
});

test("legacy binary media receive non-executable content types from their signatures", async () => {
  for (const [signature, mime] of [
    ["RIFF0000WAVE", "audio/wav"],
    ["0000ftypisom", "video/mp4"],
    ["ID3", "audio/mpeg"],
    ["OggS", "audio/ogg"],
    ["fLaC", "audio/flac"],
  ]) {
    const response = await fileResponse(
      new Request("https://nivra.test/file"),
      memorySource(new TextEncoder().encode(signature)),
      { name: "recording", mime: "application/octet-stream" },
    );
    assert.equal(response.headers.get("Content-Type"), mime);
    assert.match(response.headers.get("Content-Disposition")!, /^inline/);
  }
  const active = await fileResponse(
    new Request("https://nivra.test/file"),
    memorySource(new TextEncoder().encode("<html><script>alert(1)</script>")),
    { name: "movie.mp4", mime: "application/octet-stream" },
  );
  assert.equal(active.headers.get("Content-Type"), "application/octet-stream");
  assert.match(active.headers.get("Content-Disposition")!, /^attachment/);
});

test("file delivery releases retained-storage pins on completion, cancellation, invalid ranges and read failure", async () => {
  for (const scenario of ["small", "stream", "cancel", "range", "failure"]) {
    let released = 0;
    const bytes = new Uint8Array(scenario === "small" ? 8 : 3 * 1024 * 1024);
    const source = {
      ...memorySource(bytes),
      release: async () => {
        released++;
      },
      ...(scenario === "failure"
        ? {
            read: async () => {
              throw new Error("fixture read failure");
            },
          }
        : {}),
    };
    const request = new Request("https://nivra.test/file", {
      headers: scenario === "range" ? { Range: "bytes=99999999-" } : {},
    });
    if (scenario === "failure") {
      const response = await fileResponse(request, source, file);
      await assert.rejects(response.arrayBuffer());
    } else {
      const response = await fileResponse(request, source, file);
      if (scenario === "cancel") await response.body!.cancel();
      else await response.arrayBuffer();
    }
    assert.equal(released, 1, scenario);
  }
});
