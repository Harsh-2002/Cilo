import path from "node:path";
import { z } from "zod";
import { runtimeFs as fs } from "./runtime-fs";
import { persistEncryptionMode } from "./encryption-mode";
import { replaceFile } from "./encryption";

export const installationDirectory = () =>
  path.resolve(process.env.NIVRA_DATA_DIR || "./data");
export class InstallationBusyError extends Error {}
const record = z.object({ version: z.literal(1), publicUrl: z.url() }).strict();
export function installationExists() {
  const directory = installationDirectory();
  return (
    fs.existsSync(path.join(directory, "encryption-mode.json")) ||
    fs.existsSync(path.join(directory, "nivra.sqlite"))
  );
}
export function installationUrl() {
  if (process.env.NIVRA_PUBLIC_URL)
    return new URL(process.env.NIVRA_PUBLIC_URL).origin;
  const file = path.join(installationDirectory(), "installation.json");
  return fs.existsSync(file)
    ? record.parse(JSON.parse(fs.readFileSync(file, "utf8"))).publicUrl
    : undefined;
}
export function initializeInstallation(encrypted: boolean, publicUrl: string) {
  const directory = installationDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "installation.lock");
  let descriptor: number;
  try {
    descriptor = fs.openSync(lock, "wx", 0o600);
  } catch {
    let stale = false;
    try {
      const pid = Number(fs.readFileSync(lock, "utf8"));
      if (!Number.isInteger(pid) || pid <= 0)
        stale = Date.now() - fs.statSync(lock).mtimeMs > 60000;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          stale = (error as NodeJS.ErrnoException).code === "ESRCH";
        }
      }
    } catch {}
    if (!stale)
      throw new InstallationBusyError(
        "Installation is initializing. Retry shortly.",
      );
    fs.unlinkSync(lock);
    descriptor = fs.openSync(lock, "wx", 0o600);
  }
  fs.writeFileSync(descriptor, String(process.pid));
  fs.fsyncSync(descriptor);
  try {
    if (installationExists()) return;
    const url = new URL(publicUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use an HTTP or HTTPS installation address.");
    replaceFile(
      path.join(directory, "installation.json"),
      Buffer.from(JSON.stringify({ version: 1, publicUrl: url.origin })),
    );
    persistEncryptionMode(directory, encrypted);
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
}
