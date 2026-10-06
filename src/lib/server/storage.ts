import { environment } from "./environment";
import { runtimeFs } from "./runtime-fs";
const { mkdir, open, readFile, writeFile, unlink, rename } = runtimeFs.promises;
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { dataDir, sqlite } from "./db";
import { encryptionEnabled } from "./encryption-mode";
import {
  chunkedHeaderLength,
  chunkedLayout,
  isChunked,
  isEncrypted,
  isSingleMessage,
  masterKey,
  openChunk,
  sealChunked,
  unseal,
  unsealChunked,
  syncDirectory,
} from "./encryption";
export interface StorageAdapter {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export interface StoredFile {
  size: number;
  // Both bounds are inclusive plaintext offsets; only the covering chunks are read and authenticated.
  read(start: number, end: number): Promise<Buffer<ArrayBuffer>>;
}
interface RawStorageAdapter extends StorageAdapter {
  replace(key: string, data: Uint8Array): Promise<void>;
  readRange(
    key: string,
    offset: number,
    length: number,
  ): Promise<{ data: Buffer; size: number; whole?: Buffer }>;
}
interface FileStorageAdapter extends StorageAdapter {
  read(key: string): Promise<Buffer<ArrayBuffer>>;
  open(key: string): Promise<StoredFile>;
  migrateLegacy(key: string): Promise<void>;
}
const upgradeThreshold = 1024 * 1024;
function validateKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return key;
}
function createRawStorage(
  env: Record<string, string | undefined> = environment(),
): RawStorageAdapter {
  env = environment(env);
  const backend = env.NIVRA_STORAGE_BACKEND || "local";
  if (backend === "local") {
    const directory = path.join(
      /* turbopackIgnore: true */ path.resolve(env.NIVRA_DATA_DIR || dataDir),
      "uploads",
    );
    const file = (key: string) => path.join(directory, validateKey(key));
    return {
      async write(key, data) {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(file(key), data, {
          flag: "wx",
          mode: 0o600,
          flush: true,
        });
        syncDirectory(directory);
      },
      async read(key) {
        return readFile(file(key));
      },
      async readRange(key, offset, length) {
        const handle = await open(file(key), "r");
        try {
          const { size } = await handle.stat();
          const data = Buffer.allocUnsafe(
            Math.max(0, Math.min(length, size - offset)),
          );
          let filled = 0;
          while (filled < data.length) {
            const { bytesRead } = await handle.read(
              data,
              filled,
              data.length - filled,
              offset + filled,
            );
            if (!bytesRead) break;
            filled += bytesRead;
          }
          return { data: data.subarray(0, filled), size };
        } finally {
          await handle.close();
        }
      },
      async replace(key, data) {
        const temporary = `${file(key)}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, data, {
            flag: "wx",
            mode: 0o600,
            flush: true,
          });
          await rename(temporary, file(key));
          syncDirectory(directory);
        } finally {
          await unlink(temporary).catch((e) => {
            if (e.code !== "ENOENT") throw e;
          });
        }
      },
      async delete(key) {
        await unlink(file(key)).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      },
    };
  }
  if (backend !== "s3")
    throw new Error("NIVRA_STORAGE_BACKEND must be local or s3.");
  const bucket = env.NIVRA_S3_BUCKET;
  const accessKeyId = env.NIVRA_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.NIVRA_S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey)
    throw new Error(
      "S3 storage requires NIVRA_S3_BUCKET, NIVRA_S3_ACCESS_KEY_ID, and NIVRA_S3_SECRET_ACCESS_KEY.",
    );
  if (env.NIVRA_S3_ENDPOINT && !/^https?:\/\//.test(env.NIVRA_S3_ENDPOINT))
    throw new Error("NIVRA_S3_ENDPOINT must be an HTTP or HTTPS URL.");
  const prefix = (env.NIVRA_S3_PREFIX || "nivra/").replace(/^\/+|\/+$/g, "");
  const objectKey = (key: string) =>
    `${prefix ? `${prefix}/` : ""}${validateKey(key)}`;
  const client = new S3Client({
    endpoint: env.NIVRA_S3_ENDPOINT || undefined,
    region: env.NIVRA_S3_REGION || "us-east-1",
    forcePathStyle: env.NIVRA_S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    async write(key, data) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(key),
          Body: data,
          ContentType: "application/octet-stream",
          IfNoneMatch: "*",
        }),
      );
    },
    async read(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }),
      );
      if (!result.Body) throw new Error("Stored file is empty.");
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async readRange(key, offset, length) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey(key),
          Range: `bytes=${offset}-${offset + length - 1}`,
        }),
      );
      if (!result.Body) throw new Error("Stored file is empty.");
      const data = Buffer.from(await result.Body.transformToByteArray());
      const total = /\/(\d+)$/.exec(result.ContentRange || "")?.[1];
      // A server that ignores Range returns the whole object.
      if (total === undefined)
        return {
          data: data.subarray(offset, offset + length),
          size: data.length,
          whole: data,
        };
      return { data, size: Number(total) };
    },
    async replace(key, data) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(key),
          Body: data,
          ContentType: "application/octet-stream",
        }),
      );
    },
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }),
      );
    },
  };
}
const upgrades = new Map<string, Promise<void>>();
let upgradeQueue: Promise<void> = Promise.resolve();
export function createStorage(
  env: Record<string, string | undefined> = environment(),
): FileStorageAdapter {
  env = environment(env);
  const raw = createRawStorage(env);
  if (!encryptionEnabled(path.resolve(env.NIVRA_DATA_DIR || dataDir), env)) {
    async function open(id: string): Promise<StoredFile> {
      const head = await raw
        .readRange(id, 0, 1)
        .catch(async (error: unknown) => {
          const status = (error as { $metadata?: { httpStatusCode?: number } })
            .$metadata?.httpStatusCode;
          if (status !== 416) throw error;
          const whole = await raw.read(id);
          if (whole.length) throw error;
          return { data: whole, size: 0, whole };
        });
      let whole = head.whole;
      return {
        size: head.size,
        async read(start, end) {
          const last = Math.min(end, head.size - 1);
          if (start < 0 || start > last) return Buffer.alloc(0);
          const output = Buffer.allocUnsafeSlow(last - start + 1);
          for (let offset = start; offset <= last; offset += 1024 * 1024) {
            const length = Math.min(1024 * 1024, last - offset + 1);
            const stored = whole
              ? { data: whole.subarray(offset, offset + length), whole }
              : await raw.readRange(id, offset, length);
            if (stored.whole) whole = stored.whole;
            if (stored.data.length !== length)
              throw new Error("Stored file is truncated.");
            stored.data.copy(output, offset - start);
          }
          return output;
        },
      };
    }
    return {
      write: (id, bytes) => raw.write(id, bytes),
      delete: (id) => raw.delete(id),
      open,
      read: async (id) => {
        const file = await open(id);
        return file.size ? file.read(0, file.size - 1) : Buffer.alloc(0);
      },
      migrateLegacy: async (id) => {
        await raw.readRange(id, 0, 1);
      },
    };
  }
  const key = masterKey(
    path.resolve(env.NIVRA_DATA_DIR || dataDir),
    false,
    env,
  );
  const context = (id: string) => `object:${validateKey(id)}`;
  async function upgradeLegacy(id: string, plain: Buffer) {
    if (upgrades.has(id)) return;
    const task = upgradeQueue.then(async () => {
      const sealed = sealChunked(plain, key, context(id));
      if (!unsealChunked(sealed, key, context(id)).equals(plain))
        throw new Error("Converted file did not verify.");
      const current = await raw.readRange(id, 0, 8);
      if (!isSingleMessage(current.data)) return;
      await raw.replace(id, sealed);
    });
    const tracked = task
      .catch(() =>
        console.warn(
          "A stored file could not be converted to chunked encryption; the original is unchanged.",
        ),
      )
      .finally(() => upgrades.delete(id));
    upgrades.set(id, tracked);
    upgradeQueue = tracked;
  }
  async function open(id: string): Promise<StoredFile> {
    const head = await raw.readRange(id, 0, chunkedHeaderLength);
    if (isChunked(head.data)) {
      const layout = chunkedLayout(head.data, head.size);
      const step = layout.chunkSize + 16;
      let whole = head.whole;
      if (!layout.size) {
        const stored = whole
          ? whole.subarray(chunkedHeaderLength)
          : (await raw.readRange(id, chunkedHeaderLength, 16)).data;
        openChunk(layout, key, context(id), 0, stored);
      }
      return {
        size: layout.size,
        async read(start, end) {
          const last = Math.min(end, layout.size - 1);
          if (start < 0 || start > last) return Buffer.alloc(0);
          const first = Math.floor(start / layout.chunkSize);
          const final = Math.floor(last / layout.chunkSize);
          const output = Buffer.allocUnsafeSlow(last - start + 1);
          const batchSize = Math.max(1, Math.floor((1024 * 1024) / step));
          for (let batch = first; batch <= final; batch += batchSize) {
            const batchEnd = Math.min(final, batch + batchSize - 1);
            const offset = chunkedHeaderLength + batch * step;
            const length = (batchEnd - batch + 1) * step;
            const stored = whole
              ? { data: whole.subarray(offset, offset + length), whole }
              : await raw.readRange(id, offset, length);
            if (stored.whole) whole = stored.whole;
            for (let index = batch; index <= batchEnd; index++) {
              const plain = openChunk(
                layout,
                key,
                context(id),
                index,
                stored.data.subarray(
                  (index - batch) * step,
                  (index - batch + 1) * step,
                ),
              );
              const offset = index * layout.chunkSize;
              const from = Math.max(start, offset);
              const to = Math.min(last + 1, offset + plain.length);
              plain.copy(output, from - start, from - offset, to - offset);
            }
          }
          return output;
        },
      };
    }
    const plain = unseal(await raw.read(id), key, context(id));
    if (plain.length >= upgradeThreshold) void upgradeLegacy(id, plain);
    return {
      size: plain.length,
      read: async (start, end) => {
        const range = plain.subarray(
          Math.max(0, start),
          Math.min(end, plain.length - 1) + 1,
        );
        // Legacy conversion retains its plaintext, so readers must own their buffers.
        const output = Buffer.allocUnsafeSlow(range.length);
        range.copy(output);
        return output;
      },
    };
  }
  return {
    write: (id, bytes) => raw.write(id, sealChunked(bytes, key, context(id))),
    open,
    read: async (id) => {
      const file = await open(id);
      return file.size ? file.read(0, file.size - 1) : Buffer.alloc(0);
    },
    delete: async (id) => {
      await upgrades.get(id);
      await raw.delete(id);
    },
    async migrateLegacy(id) {
      const bytes = await raw.read(id);
      if (isEncrypted(bytes)) {
        if (isChunked(bytes)) unsealChunked(bytes, key, context(id));
        else unseal(bytes, key, context(id));
        return;
      }
      await raw.replace(id, sealChunked(bytes, key, context(id)));
    },
  };
}
let adapter: FileStorageAdapter | undefined;
const runtime = globalThis as unknown as {
  nivraFilePins?: Map<string, number>;
  nivraDeferredDeletes?: Set<string>;
};
const pins = (runtime.nivraFilePins ||= new Map<string, number>());
const deferred = (runtime.nivraDeferredDeletes ||= new Set<string>());
export function pinStoredFiles(keys: string[]) {
  for (const key of keys) pins.set(key, (pins.get(key) || 0) + 1);
  return async () => {
    const removals: string[] = [];
    for (const key of keys) {
      const count = (pins.get(key) || 1) - 1;
      if (count) pins.set(key, count);
      else {
        pins.delete(key);
        if (deferred.delete(key)) removals.push(key);
      }
    }
    const results = await Promise.allSettled(
      removals.map((key) => (adapter ||= createStorage()).delete(key)),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new Error("Some deferred file deletions could not be completed.");
  };
}
export const storage: FileStorageAdapter = {
  write: (key, data) => (adapter ||= createStorage()).write(key, data),
  read: (key) => (adapter ||= createStorage()).read(key),
  open: (key) => (adapter ||= createStorage()).open(key),
  delete: async (key) => {
    if (pins.has(key)) {
      deferred.add(key);
      return;
    }
    await (adapter ||= createStorage()).delete(key);
  },
  migrateLegacy: (key) => (adapter ||= createStorage()).migrateLegacy(key),
};
const migrations = new WeakMap<object, Promise<void>>();
export function migrateStoredFiles(): Promise<void> {
  const database = sqlite();
  let migration = migrations.get(database);
  if (!migration) {
    migration = (async () => {
      const pending = database
        .prepare("SELECT storage_key FROM encryption_pending_files")
        .all() as { storage_key: string }[];
      for (const item of pending) {
        await storage.migrateLegacy(item.storage_key);
        database
          .prepare("DELETE FROM encryption_pending_files WHERE storage_key=?")
          .run(item.storage_key);
      }
    })();
    migrations.set(database, migration);
    migration.catch(() => migrations.delete(database));
  }
  return migration;
}
