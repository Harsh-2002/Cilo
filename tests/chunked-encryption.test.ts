import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  chunkSize,
  chunkedHeaderLength,
  chunkedLayout,
  isChunked,
  isEncrypted,
  openChunk,
  seal,
  sealChunked,
  unseal,
  unsealChunked,
} from "../src/lib/server/encryption";

const step = chunkSize + 16;
const key = randomBytes(32);

test("chunked encryption round-trips empty, boundary and multi-chunk objects", () => {
  for (const length of [
    0,
    1,
    chunkSize - 1,
    chunkSize,
    chunkSize + 1,
    chunkSize * 3,
    chunkSize * 3 + 17,
  ]) {
    const bytes = randomBytes(length);
    const sealed = sealChunked(bytes, key, "object:a");
    assert.ok(isChunked(sealed) && isEncrypted(sealed), String(length));
    const layout = chunkedLayout(sealed, sealed.length);
    assert.equal(layout.size, length, String(length));
    assert.equal(layout.chunks, Math.max(1, Math.ceil(length / chunkSize)));
    assert.deepEqual(unsealChunked(sealed, key, "object:a"), bytes);
    assert.notDeepEqual(sealed, sealChunked(bytes, key, "object:a"));
  }
});

test("a single chunk opens on its own and ciphertext never contains plaintext", () => {
  const bytes = Buffer.concat([
    Buffer.alloc(chunkSize, 1),
    Buffer.alloc(chunkSize, 2),
    Buffer.from("tail marker that must stay private"),
  ]);
  const sealed = sealChunked(bytes, key, "object:a");
  assert.equal(sealed.indexOf("tail marker"), -1);
  const layout = chunkedLayout(sealed, sealed.length);
  const second = openChunk(
    layout,
    key,
    "object:a",
    1,
    sealed.subarray(chunkedHeaderLength + step, chunkedHeaderLength + 2 * step),
  );
  assert.deepEqual(second, Buffer.alloc(chunkSize, 2));
});

test("chunked objects reject wrong keys, other objects, and every kind of tampering", () => {
  const bytes = randomBytes(chunkSize * 3 + 100);
  const sealed = sealChunked(bytes, key, "object:a");
  assert.throws(
    () => unsealChunked(sealed, randomBytes(32), "object:a"),
    /authentication/,
  );
  assert.throws(() => unsealChunked(sealed, key, "object:b"), /authentication/);
  for (const offset of [
    9, // chunk size
    14, // salt
    chunkedHeaderLength + 3,
    chunkedHeaderLength + step + 5,
    sealed.length - 1,
  ]) {
    const damaged = Buffer.from(sealed);
    damaged[offset] ^= 1;
    assert.throws(
      () => unsealChunked(damaged, key, "object:a"),
      /authentication|valid encrypted/,
      `byte ${offset}`,
    );
  }
  assert.throws(
    () => unsealChunked(sealed.subarray(0, 12), key, "object:a"),
    /valid encrypted/,
  );
  assert.throws(() => chunkedLayout(bytes, bytes.length), /valid encrypted/);
});

test("truncation, appended chunks and reordering are detected", () => {
  const bytes = randomBytes(chunkSize * 4);
  const sealed = sealChunked(bytes, key, "object:a");
  const header = sealed.subarray(0, chunkedHeaderLength);
  const chunk = (index: number) =>
    sealed.subarray(
      chunkedHeaderLength + index * step,
      chunkedHeaderLength + (index + 1) * step,
    );
  const truncated = Buffer.concat([header, chunk(0), chunk(1), chunk(2)]);
  assert.throws(
    () => unsealChunked(truncated, key, "object:a"),
    /authentication/,
  );
  const appended = Buffer.concat([sealed, chunk(0)]);
  assert.throws(
    () => unsealChunked(appended, key, "object:a"),
    /authentication/,
  );
  const reordered = Buffer.concat([
    header,
    chunk(1),
    chunk(0),
    chunk(2),
    chunk(3),
  ]);
  assert.throws(
    () => unsealChunked(reordered, key, "object:a"),
    /authentication/,
  );
  const other = sealChunked(bytes, key, "object:a");
  const spliced = Buffer.concat([
    header,
    other.subarray(chunkedHeaderLength, chunkedHeaderLength + step),
    chunk(1),
    chunk(2),
    chunk(3),
  ]);
  assert.throws(
    () => unsealChunked(spliced, key, "object:a"),
    /authentication/,
  );
});

test("single-message encryption stays readable and is not confused with chunked objects", () => {
  const bytes = Buffer.from("legacy object");
  const legacy = seal(bytes, key, "object:a");
  assert.ok(isEncrypted(legacy) && !isChunked(legacy));
  assert.deepEqual(unseal(legacy, key, "object:a"), bytes);
  assert.throws(
    () => unseal(sealChunked(bytes, key, "object:a"), key, "object:a"),
    /valid encrypted/,
  );
});
