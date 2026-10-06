import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createStorage } from "../src/lib/server/storage";
import { masterKey, seal } from "../src/lib/server/encryption";
import { MessageChannel } from "node:worker_threads";

const chunk = 65536;
const stored = chunk + 16;
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-media-"));
  const store = createStorage({ NIVRA_DATA_DIR: directory });
  const object = (id: string) => path.join(directory, "uploads", id);
  return { directory, store, object };
}
const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

test("random ranges of a chunked object match the plaintext", async () => {
  const { directory, store } = await fixture();
  try {
    for (const length of [0, 1, chunk, chunk + 1, chunk * 5 + 321]) {
      const id = randomUUID();
      const bytes = randomBytes(length);
      await store.write(id, bytes);
      const file = await store.open(id);
      assert.equal(file.size, length);
      assert.deepEqual(await store.read(id), bytes);
      for (let i = 0; i < 40 && length; i++) {
        const start = randomInt(length);
        const end = Math.min(length - 1, start + randomInt(chunk * 2));
        assert.deepEqual(
          await file.read(start, end),
          bytes.subarray(start, end + 1),
          `${length}:${start}-${end}`,
        );
      }
      assert.equal((await file.read(length, length + 10)).length, 0);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("each chunk is authenticated when read, and damage, truncation and swaps are rejected", async () => {
  const { directory, store, object } = await fixture();
  try {
    const id = randomUUID();
    const bytes = randomBytes(chunk * 4 + 50);
    await store.write(id, bytes);
    const original = await readFile(object(id));
    const damaged = Buffer.from(original);
    damaged[28 + 2 * stored + 7] ^= 1;
    await writeFile(object(id), damaged);
    const file = await store.open(id);
    assert.deepEqual(await file.read(0, 99), bytes.subarray(0, 100));
    await assert.rejects(file.read(chunk * 2, chunk * 2 + 5), /authentication/);
    await assert.rejects(store.read(id), /authentication/);

    await writeFile(object(id), original.subarray(0, original.length - stored));
    const shorter = await store.open(id);
    await assert.rejects(shorter.read(0, shorter.size - 1), /authentication/);

    await writeFile(object(id), original);
    const other = randomUUID();
    await writeFile(object(other), original);
    await assert.rejects(store.read(other), /authentication/);
    assert.deepEqual(await store.read(id), bytes);

    await writeFile(object(id), Buffer.from("plain text, not encrypted"));
    await assert.rejects(store.open(id), /valid encrypted/);
    await writeFile(object(id), original.subarray(0, 12));
    await assert.rejects(store.open(id), /valid encrypted/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a different key cannot read chunked objects", async () => {
  const { directory, store } = await fixture();
  const stranger = await mkdtemp(path.join(tmpdir(), "nivra-media-key-"));
  try {
    const id = randomUUID();
    await store.write(id, randomBytes(chunk * 2));
    await mkdir(path.join(stranger, "uploads"));
    await writeFile(
      path.join(stranger, "uploads", id),
      await readFile(path.join(directory, "uploads", id)),
    );
    const wrong = createStorage({ NIVRA_DATA_DIR: stranger });
    const file = await wrong.open(id);
    await assert.rejects(file.read(0, 10), /authentication/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(stranger, { recursive: true, force: true });
  }
});

test("empty chunked objects authenticate their final tag and object identity", async () => {
  const { directory, store, object } = await fixture();
  try {
    const id = randomUUID();
    await store.write(id, Buffer.alloc(0));
    assert.equal((await store.read(id)).length, 0);
    const bytes = await readFile(object(id));
    const other = randomUUID();
    await writeFile(object(other), bytes);
    await assert.rejects(store.open(other), /authentication/);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(object(id), bytes);
    await assert.rejects(store.read(id), /authentication/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy single-message objects stay readable and large ones convert in place", async () => {
  const { directory, store, object } = await fixture();
  try {
    const key = masterKey(directory);
    await mkdir(path.join(directory, "uploads"), { recursive: true });
    const small = randomUUID();
    const smallBytes = randomBytes(2000);
    await writeFile(object(small), seal(smallBytes, key, `object:${small}`));
    const smallFile = await store.open(small);
    assert.deepEqual(await smallFile.read(10, 19), smallBytes.subarray(10, 20));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      (await readFile(object(small))).subarray(0, 8).toString(),
      Buffer.from([67, 73, 76, 79, 69, 78, 67, 49]).toString(),
    );

    const large = randomUUID();
    const largeBytes = randomBytes(1024 * 1024 + 4321);
    await writeFile(object(large), seal(largeBytes, key, `object:${large}`));
    const largeFile = await store.open(large);
    assert.deepEqual(
      await largeFile.read(500_000, 500_099),
      largeBytes.subarray(500_000, 500_100),
    );
    assert.ok(
      await until(
        async () =>
          (await readFile(object(large))).subarray(0, 8).toString() ===
          Buffer.from([67, 73, 76, 79, 69, 78, 67, 50]).toString(),
      ),
      "large legacy object was not converted",
    );
    assert.deepEqual(await store.read(large), largeBytes);
    assert.deepEqual(
      await (await store.open(large)).read(1_000_000, 1_000_099),
      largeBytes.subarray(1_000_000, 1_000_100),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deleting a legacy object during conversion does not resurrect it", async () => {
  const { directory, store, object } = await fixture();
  try {
    const key = masterKey(directory);
    await mkdir(path.join(directory, "uploads"), { recursive: true });
    const id = randomUUID();
    await writeFile(
      object(id),
      seal(randomBytes(1024 * 1024 + 10), key, `object:${id}`),
    );
    await store.open(id);
    await store.delete(id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await assert.rejects(stat(object(id)), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("read buffers transfer without detaching other readers or a pending legacy conversion", async () => {
  const { directory, store, object } = await fixture();
  const transfer = async (bytes: Buffer<ArrayBuffer>) => {
    assert.equal(bytes.byteOffset, 0);
    assert.equal(bytes.buffer.byteLength, bytes.length);
    const { port1, port2 } = new MessageChannel();
    try {
      const received = new Promise<Uint8Array>((resolve) =>
        port2.once("message", resolve),
      );
      port1.postMessage(bytes, [bytes.buffer]);
      assert.equal(bytes.length, 0);
      return Buffer.from(await received);
    } finally {
      port1.close();
      port2.close();
    }
  };
  try {
    for (const length of [10, chunk * 2 + 7]) {
      const id = randomUUID(),
        original = randomBytes(length);
      await store.write(id, original);
      const file = await store.open(id);
      const otherReader = await file.read(2, 7);
      assert.deepEqual(await transfer(await store.read(id)), original);
      assert.deepEqual(otherReader, original.subarray(2, 8));
      assert.deepEqual(
        await transfer(await file.read(2, 7)),
        original.subarray(2, 8),
      );
      assert.deepEqual(await store.read(id), original);
    }
    const id = randomUUID(),
      original = randomBytes(1024 * 1024 + 123);
    await writeFile(
      object(id),
      seal(original, masterKey(directory), `object:${id}`),
    );
    assert.deepEqual(await transfer(await store.read(id)), original);
    assert.ok(await until(async () => (await readFile(object(id)))[7] === 50));
    assert.deepEqual(await store.read(id), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
