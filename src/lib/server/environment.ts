import { historicalConfigPrefix, historicalNamespace } from "../compatibility";
export function environment(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    ...source,
  };
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith(historicalConfigPrefix)) {
      const current = `NIVRA_${name.slice(historicalConfigPrefix.length)}`;
      if (result[current] === undefined) result[current] = value;
    }
  }
  if (
    source.NIVRA_STORAGE_BACKEND === undefined &&
    source[`${historicalConfigPrefix}STORAGE_BACKEND`] === "s3"
  )
    result.NIVRA_S3_PREFIX ??= `${historicalNamespace}/`;
  if (
    source.NIVRA_BACKUP_BACKEND === undefined &&
    source[`${historicalConfigPrefix}BACKUP_BACKEND`] === "s3"
  )
    result.NIVRA_BACKUP_S3_PREFIX ??= `${historicalNamespace}-backups/`;
  return result;
}
