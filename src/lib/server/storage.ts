import { runtimeFs } from "./runtime-fs";
const { mkdir, readFile, writeFile, unlink, rename } = runtimeFs.promises;
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { dataDir, sqlite } from "./db";
import {
  isEncrypted,
  masterKey,
  seal,
  unseal,
  syncDirectory,
} from "./encryption";
export interface StorageAdapter {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
interface RawStorageAdapter extends StorageAdapter {
  replace(key: string, data: Uint8Array): Promise<void>;
}
interface EncryptedStorageAdapter extends StorageAdapter {
  migrateLegacy(key: string): Promise<void>;
}
function validateKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return key;
}
function createRawStorage(
  env: Record<string, string | undefined> = process.env,
): RawStorageAdapter {
  const backend = env.CILO_STORAGE_BACKEND || "local";
  if (backend === "local") {
    const directory = path.join(
      /* turbopackIgnore: true */ path.resolve(env.CILO_DATA_DIR || dataDir),
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
    throw new Error("CILO_STORAGE_BACKEND must be local or s3.");
  const bucket = env.CILO_S3_BUCKET;
  const accessKeyId = env.CILO_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.CILO_S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey)
    throw new Error(
      "S3 storage requires CILO_S3_BUCKET, CILO_S3_ACCESS_KEY_ID, and CILO_S3_SECRET_ACCESS_KEY.",
    );
  if (env.CILO_S3_ENDPOINT && !/^https?:\/\//.test(env.CILO_S3_ENDPOINT))
    throw new Error("CILO_S3_ENDPOINT must be an HTTP or HTTPS URL.");
  const prefix = (env.CILO_S3_PREFIX || "cilo/").replace(/^\/+|\/+$/g, "");
  const objectKey = (key: string) =>
    `${prefix ? `${prefix}/` : ""}${validateKey(key)}`;
  const client = new S3Client({
    endpoint: env.CILO_S3_ENDPOINT || undefined,
    region: env.CILO_S3_REGION || "us-east-1",
    forcePathStyle: env.CILO_S3_FORCE_PATH_STYLE !== "false",
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
export function createStorage(
  env: Record<string, string | undefined> = process.env,
): EncryptedStorageAdapter {
  const raw = createRawStorage(env);
  const key = masterKey(path.resolve(env.CILO_DATA_DIR || dataDir), false, env);
  return {
    write: (id, bytes) =>
      raw.write(id, seal(bytes, key, `object:${validateKey(id)}`)),
    read: async (id) =>
      unseal(await raw.read(id), key, `object:${validateKey(id)}`),
    delete: (id) => raw.delete(id),
    async migrateLegacy(id) {
      const bytes = await raw.read(id);
      if (isEncrypted(bytes)) {
        unseal(bytes, key, `object:${validateKey(id)}`);
        return;
      }
      await raw.replace(id, seal(bytes, key, `object:${validateKey(id)}`));
    },
  };
}
let adapter: EncryptedStorageAdapter | undefined;
const runtime = globalThis as unknown as {
  ciloFilePins?: Map<string, number>;
  ciloDeferredDeletes?: Set<string>;
};
const pins = (runtime.ciloFilePins ||= new Map<string, number>());
const deferred = (runtime.ciloDeferredDeletes ||= new Set<string>());
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
export const storage: EncryptedStorageAdapter = {
  write: (key, data) => (adapter ||= createStorage()).write(key, data),
  read: (key) => (adapter ||= createStorage()).read(key),
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
