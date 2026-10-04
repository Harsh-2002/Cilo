import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { dataDir } from "./db";
export interface StorageAdapter {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
function validateKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return key;
}
export function createStorage(
  env: Record<string, string | undefined> = process.env,
): StorageAdapter {
  const backend = env.CILO_STORAGE_BACKEND || "local";
  if (backend === "local") {
    const directory = path.join(dataDir, "uploads");
    const file = (key: string) => path.join(directory, validateKey(key));
    return {
      async write(key, data) {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(file(key), data, { flag: "wx", mode: 0o600 });
      },
      async read(key) {
        return readFile(file(key));
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
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }),
      );
    },
  };
}
let adapter: StorageAdapter | undefined;
export const storage: StorageAdapter = {
  write: (key, data) => (adapter ||= createStorage()).write(key, data),
  read: (key) => (adapter ||= createStorage()).read(key),
  delete: (key) => (adapter ||= createStorage()).delete(key),
};
