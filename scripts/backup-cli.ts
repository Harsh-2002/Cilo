import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
async function main() {
  if (existsSync(".env")) loadEnvFile(".env");
  const [command, id, destination] = process.argv.slice(2);
  const backups = await import("../src/lib/server/backups");
  if (command === "copy-files" && (id === "local" || id === "s3")) {
    console.log(JSON.stringify(await backups.copyStoredFiles(id)));
    console.log(
      "Files copied and verified. Update NIVRA_STORAGE_BACKEND before restarting Nivra; the source is retained.",
    );
  } else if (command === "create")
    console.log(JSON.stringify(await backups.createBackup()));
  else if (command === "list")
    console.log(JSON.stringify(await backups.listBackups(), null, 2));
  else if (command === "verify" && id)
    console.log(JSON.stringify(await backups.verifyBackup(id)));
  else if (command === "restore" && id && destination) {
    console.log(JSON.stringify(await backups.restoreBackup(id, destination)));
    console.log(
      "Restore verified. Start this directory with NIVRA_STORAGE_BACKEND=local and the original encryption key.",
    );
  } else
    throw new Error(
      "Usage: backup create | list | verify <id> | restore <id> <empty-directory> | copy-files <local|s3>",
    );
}
void main().catch(() => {
  console.error(
    "Backup command failed. Check the command, original encryption key, backup destination, available space, and empty restore directory. Existing data has not been overwritten.",
  );
  process.exitCode = 1;
});
