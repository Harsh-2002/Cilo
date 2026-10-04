export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sqlite } = await import("./lib/server/db");
    sqlite();
    const { migrateStoredFiles } = await import("./lib/server/storage");
    await migrateStoredFiles();
    const { authSecret } = await import("./lib/server/auth");
    authSecret();
    const { startBackupScheduler } = await import("./lib/server/backups");
    startBackupScheduler();
  }
}
