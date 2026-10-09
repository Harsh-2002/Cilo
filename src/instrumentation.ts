export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installationExists } = await import("./lib/server/installation");
    const startup = await import("./lib/server/startup");
    startup.enableWorkers();
    if (installationExists()) await startup.startInstallationWorkers();
  }
}
