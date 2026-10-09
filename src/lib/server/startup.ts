const lifecycle = globalThis as unknown as {
  nivraWorkersEnabled?: boolean;
  nivraWorkersStarting?: Promise<void>;
};
export async function startInstallationWorkersAfterSetup() {
  if (lifecycle.nivraWorkersEnabled) await startInstallationWorkers();
}
async function initializeWorkers() {
  const { sqlite } = await import("./db");
  sqlite();
  const { systemConfiguration } = await import("./system-configuration");
  systemConfiguration();
  const { startStorageTransferWorker } = await import("./system-api");
  startStorageTransferWorker();
  const { migrateStoredFiles } = await import("./storage");
  await migrateStoredFiles();
  const { authSecret } = await import("./auth");
  authSecret();
  const { preparePublicationPages } = await import("./publication-html");
  await preparePublicationPages();
  const { startBackupScheduler } = await import("./backups");
  startBackupScheduler();
  const { resumeThumbnails } = await import("./artifact-thumbnails");
  resumeThumbnails();
  const { startJobWorker } = await import("./jobs");
  startJobWorker();
  const { startReminderWorker } = await import("./calendar-reminders");
  const { installationUrl } = await import("./installation");
  startReminderWorker(installationUrl() || "http://localhost:3000");
}
export function startInstallationWorkers() {
  return (lifecycle.nivraWorkersStarting ||= initializeWorkers().catch(
    (error) => {
      lifecycle.nivraWorkersStarting = undefined;
      throw error;
    },
  ));
}
export function enableWorkers() {
  lifecycle.nivraWorkersEnabled = true;
}
