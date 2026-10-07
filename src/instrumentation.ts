export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sqlite } = await import("./lib/server/db");
    sqlite();
    const { migrateStoredFiles } = await import("./lib/server/storage");
    await migrateStoredFiles();
    const { authSecret } = await import("./lib/server/auth");
    authSecret();
    const { preparePublicationPages } =
      await import("./lib/server/publication-html");
    await preparePublicationPages();
    const { startBackupScheduler } = await import("./lib/server/backups");
    startBackupScheduler();
    const { resumeThumbnails } =
      await import("./lib/server/artifact-thumbnails");
    resumeThumbnails();
    const { startJobWorker } = await import("./lib/server/jobs");
    startJobWorker();
  }
}
