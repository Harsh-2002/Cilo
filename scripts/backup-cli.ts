import { loadEnvFile } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
async function main() {
  for (const file of [".env.local", ".env"])
    if (existsSync(file)) loadEnvFile(file);
  const args = process.argv.slice(2);
  let source: NodeJS.ProcessEnv | undefined;
  for (const flag of ["--connection-file", "--backup-directory"]) {
    const position = args.indexOf(flag);
    if (position === -1) continue;
    const file = args[position + 1];
    if (!file || source) throw new Error("Choose one recovery repository.");
    if (flag === "--backup-directory")
      source = {
        NODE_ENV: process.env.NODE_ENV ?? "production",
        NIVRA_ENCRYPTION_KEY_FILE: process.env.NIVRA_ENCRYPTION_KEY_FILE,
        NIVRA_DATA_DIR: process.env.NIVRA_DATA_DIR,
        NIVRA_S3_BACKUP_ENABLED: "false",
        NIVRA_BACKUP_DIR: path.resolve(file),
      };
    else {
      const { connectionInput } =
        await import("../src/lib/server/system-configuration");
      const value = connectionInput.parse(
        JSON.parse(readFileSync(file, "utf8")),
      );
      if (!value.accessKeyId || !value.secretAccessKey)
        throw new Error("Recovery credentials are required.");
      source = {
        NODE_ENV: process.env.NODE_ENV ?? "production",
        NIVRA_ENCRYPTION_KEY_FILE: process.env.NIVRA_ENCRYPTION_KEY_FILE,
        NIVRA_DATA_DIR: process.env.NIVRA_DATA_DIR,
        NIVRA_S3_BACKUP_ENABLED: "true",
        NIVRA_S3_ENDPOINT: value.endpoint,
        NIVRA_S3_REGION: value.region,
        NIVRA_S3_BUCKET: value.bucket,
        NIVRA_S3_ACCESS_KEY_ID: value.accessKeyId,
        NIVRA_S3_SECRET_ACCESS_KEY: value.secretAccessKey,
        NIVRA_S3_FORCE_PATH_STYLE: String(value.pathStyle),
        NIVRA_BACKUP_PREFIX: "nivra-backups",
      };
    }
    args.splice(position, 2);
  }
  const [command, id, destination] = args;
  const { installationExists } = await import("../src/lib/server/installation");
  if (!source && !installationExists()) {
    if (command === "list") {
      console.log("[]");
      return;
    }
    throw new Error("Complete setup or choose a recovery repository.");
  }
  const backups = await import("../src/lib/server/backups");
  if (command === "create" && !source)
    console.log(JSON.stringify(await backups.createBackup()));
  else if (command === "list")
    console.log(JSON.stringify(await backups.listBackups(source), null, 2));
  else if (command === "verify" && id)
    console.log(JSON.stringify(await backups.verifyBackup(id, source)));
  else if (command === "restore" && id && destination) {
    console.log(
      JSON.stringify(await backups.restoreBackup(id, destination, source)),
    );
    console.log(
      "Restore verified. Mount the restored directory and retain the original encryption key.",
    );
  } else
    throw new Error(
      "Usage: backup create | list | verify <id> | restore <id> <empty-directory> [--backup-directory <path> | --connection-file <private-json>]",
    );
}
void main().catch(() => {
  console.error(
    "Backup command failed. Check the command, original encryption key, repository and empty restore directory. Existing data has not been overwritten.",
  );
  process.exitCode = 1;
});
