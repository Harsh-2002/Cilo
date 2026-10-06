import { environment } from "./environment";
import path from "node:path";
import { runtimeFs } from "./runtime-fs";
import { syncDirectory } from "./encryption";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
export type BackupConfig = {
  backend: "local" | "s3";
  intervalHours: number;
  keep: number;
  directory: string;
};
function positive(
  value: string | undefined,
  fallback: number,
  name: string,
  max: number,
) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > max)
    throw new Error(`${name} is outside its allowed range.`);
  return result;
}
export function backupConfig(
  env: Record<string, string | undefined> = environment(),
): BackupConfig {
  env = environment(env);
  const shared = env.NIVRA_S3_BACKUP_ENABLED;
  if (shared && shared !== "true" && shared !== "false")
    throw new Error("NIVRA_S3_BACKUP_ENABLED must be true or false.");
  const backend = shared === "true" ? "s3" : "local";
  const keep = positive(env.NIVRA_BACKUP_KEEP, 7, "NIVRA_BACKUP_KEEP", 365);
  if (!Number.isInteger(keep))
    throw new Error("NIVRA_BACKUP_KEEP must be an integer.");
  return {
    backend,
    keep,
    intervalHours: positive(
      env.NIVRA_BACKUP_INTERVAL_HOURS,
      24,
      "NIVRA_BACKUP_INTERVAL_HOURS",
      8760,
    ),
    directory: path.resolve(
      /* turbopackIgnore: true */ env.NIVRA_BACKUP_DIR ||
        path.join(
          /* turbopackIgnore: true */ env.NIVRA_DATA_DIR || "./data",
          "backups",
        ),
    ),
  };
}
export const backupId = /^\d{13}-[a-f0-9-]{36}$/;
const objectPattern =
  /^\d{13}-[a-f0-9-]{36}\/(manifest|database|auth|files\/[a-f0-9-]{36})$/;
export interface BackupRepository {
  write(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  list(): Promise<string[]>;
  remove(key: string): Promise<void>;
}
export function backupRepository(
  env: Record<string, string | undefined> = environment(),
): BackupRepository {
  env = environment(env);
  const config = backupConfig(env);
  function valid(key: string) {
    if (!objectPattern.test(key)) throw new Error("Invalid backup object.");
    return key;
  }
  if (config.backend === "local") {
    const file = (key: string) =>
      path.join(/* turbopackIgnore: true */ config.directory, valid(key));
    return {
      async write(key, bytes) {
        const target = file(key);
        const directory = path.dirname(target);
        await runtimeFs.promises.mkdir(directory, {
          recursive: true,
          mode: 0o700,
        });
        await runtimeFs.promises.writeFile(target, bytes, {
          flag: "wx",
          mode: 0o600,
          flush: true,
        });
        syncDirectory(directory);
      },
      read: (key) => runtimeFs.promises.readFile(file(key)),
      async remove(key) {
        const target = file(key);
        await runtimeFs.promises.unlink(target).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
        for (const directory of [
          path.dirname(target),
          path.join(
            /* turbopackIgnore: true */ config.directory,
            key.split("/")[0],
          ),
        ]) {
          await runtimeFs.promises.rmdir(directory).catch((e) => {
            if (!["ENOENT", "ENOTEMPTY"].includes(e.code)) throw e;
          });
        }
      },
      async list() {
        const keys: string[] = [];
        let entries: import("node:fs").Dirent[];
        try {
          entries = await runtimeFs.promises.readdir(config.directory, {
            withFileTypes: true,
          });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw e;
        }
        for (const entry of entries) {
          if (!entry.isDirectory() || !backupId.test(entry.name)) continue;
          const base = path.join(
            /* turbopackIgnore: true */ config.directory,
            entry.name,
          );
          for (const name of ["database", "auth", "manifest"])
            if (
              runtimeFs.existsSync(
                path.join(/* turbopackIgnore: true */ base, name),
              )
            )
              keys.push(`${entry.name}/${name}`);
          const files = await runtimeFs.promises
            .readdir(path.join(/* turbopackIgnore: true */ base, "files"))
            .catch((e) => {
              if (e.code === "ENOENT") return [];
              throw e;
            });
          for (const name of files)
            if (objectPattern.test(`${entry.name}/files/${name}`))
              keys.push(`${entry.name}/files/${name}`);
        }
        return keys;
      },
    };
  }
  const bucket = env.NIVRA_S3_BUCKET,
    accessKeyId = env.NIVRA_S3_ACCESS_KEY_ID,
    secretAccessKey = env.NIVRA_S3_SECRET_ACCESS_KEY;
  const endpoint = env.NIVRA_S3_ENDPOINT;
  if (!bucket || !accessKeyId || !secretAccessKey)
    throw new Error("S3 backups require a bucket and S3 credentials.");
  if (endpoint && !/^https?:\/\//.test(endpoint))
    throw new Error("Backup S3 endpoint must be HTTP or HTTPS.");
  const prefix = (env.NIVRA_BACKUP_PREFIX || "nivra-backups").replace(
    /^\/+|\/+$/g,
    "",
  );
  if (!prefix || prefix.split("/").some((p) => p === "." || p === ".."))
    throw new Error("Use a dedicated, nonempty backup prefix.");
  if (
    env.NIVRA_STORAGE_BACKEND === "s3" &&
    bucket === env.NIVRA_S3_BUCKET &&
    (endpoint || "") === (env.NIVRA_S3_ENDPOINT || "")
  ) {
    const media = (env.NIVRA_S3_PREFIX || "nivra").replace(/^\/+|\/+$/g, "");
    if (
      !media ||
      prefix === media ||
      prefix.startsWith(`${media}/`) ||
      media.startsWith(`${prefix}/`)
    )
      throw new Error("Backup and media prefixes must be separate.");
  }
  const client = new S3Client({
    endpoint: endpoint || undefined,
    region: env.NIVRA_S3_REGION || "us-east-1",
    forcePathStyle: env.NIVRA_S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const key = (value: string) => `${prefix}/${valid(value)}`;
  return {
    async write(value, bytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key(value),
          Body: bytes,
          ContentType: "application/octet-stream",
          IfNoneMatch: "*",
        }),
        { abortSignal: AbortSignal.timeout(60_000) },
      );
    },
    async read(value) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key(value) }),
        { abortSignal: AbortSignal.timeout(60_000) },
      );
      if (!result.Body) throw new Error("Backup object is missing.");
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async remove(value) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key(value) }),
        { abortSignal: AbortSignal.timeout(60_000) },
      );
    },
    async list() {
      const keys: string[] = [];
      let continuation: string | undefined;
      do {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: `${prefix}/`,
            ContinuationToken: continuation,
          }),
          { abortSignal: AbortSignal.timeout(60_000) },
        );
        for (const item of result.Contents || []) {
          const value = item.Key?.slice(prefix.length + 1);
          if (value && objectPattern.test(value)) keys.push(value);
        }
        continuation = result.IsTruncated
          ? result.NextContinuationToken
          : undefined;
        if (result.IsTruncated && !continuation)
          throw new Error("Backup listing was incomplete.");
      } while (continuation);
      return keys;
    },
  };
}
