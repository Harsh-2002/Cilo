import { loadEnvFile } from "node:process";
import fs from "node:fs";
import path from "node:path";
async function main() {
  for (const file of [".env.local", ".env"])
    if (fs.existsSync(file)) loadEnvFile(file);
  const names = [
    "NIVRA_DATA_DIR",
    "NIVRA_PUBLIC_URL",
    "NIVRA_ENCRYPTION_KEY",
    "NIVRA_ENCRYPTION_KEY_FILE",
    "NIVRA_STORAGE_BACKEND",
    "NIVRA_S3_ENDPOINT",
    "NIVRA_S3_REGION",
    "NIVRA_S3_BUCKET",
    "NIVRA_S3_ACCESS_KEY_ID",
    "NIVRA_S3_SECRET_ACCESS_KEY",
    "NIVRA_S3_FORCE_PATH_STYLE",
    "NIVRA_S3_PREFIX",
    "NIVRA_BACKUP_PREFIX",
    "NIVRA_BACKUP_DIR",
    "NIVRA_S3_BACKUP_ENABLED",
    "NIVRA_UPLOAD_LIMIT_MIB",
    "NIVRA_BACKUP_INTERVAL_HOURS",
    "NIVRA_BACKUP_KEEP",
  ];
  const source: Record<string, string | undefined> = Object.fromEntries(
    names
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  const directory = path.resolve(source.NIVRA_DATA_DIR || "./data");
  if (!fs.existsSync(path.join(directory, "nivra.sqlite")))
    throw new Error("No existing installation was found.");
  const encryption = await import("../src/lib/server/encryption");
  const key = encryption.masterKey(directory, true, source);
  if (source.NIVRA_ENCRYPTION_KEY) {
    const file = path.join(directory, "imported-encryption.key");
    if (fs.existsSync(file) && !fs.readFileSync(file).equals(key))
      throw new Error(
        "The imported key file differs; existing files were not changed.",
      );
    if (!fs.existsSync(file))
      fs.writeFileSync(file, key, { mode: 0o600, flag: "wx", flush: true });
    process.env.NIVRA_ENCRYPTION_KEY_FILE = file;
  }
  encryption.replaceFile(
    path.join(directory, "configuration-import.enc"),
    encryption.seal(
      Buffer.from(JSON.stringify(source)),
      key,
      "system-configuration-import",
    ),
  );
  const { systemConfiguration } =
    await import("../src/lib/server/system-configuration");
  systemConfiguration();
  console.log(
    "Existing configuration imported. Keep the current data mount and original key. Remove retired settings only after verifying the instance; an imported external key must remain mounted through NIVRA_ENCRYPTION_KEY_FILE.",
  );
}
void main().catch(() => {
  console.error(
    "Configuration import failed. Existing data was retained; check the data location and original encryption key.",
  );
  process.exitCode = 1;
});
