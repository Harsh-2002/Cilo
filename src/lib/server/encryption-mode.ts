import path from "node:path";
import { randomUUID } from "node:crypto";
import { historicalDatabaseName } from "../compatibility";
import { environment } from "./environment";
import { runtimeFs as fs } from "./runtime-fs";
import { syncDirectory } from "./encryption";

export function persistEncryptionMode(directory: string, encrypted: boolean) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(
    /* turbopackIgnore: true */ directory,
    "encryption-mode.json",
  );
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, encrypted }), {
    flag: "wx",
    mode: 0o600,
    flush: true,
  });
  try {
    // Publish a complete record without replacing another startup's choice.
    fs.linkSync(temporary, file);
    syncDirectory(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    fs.unlinkSync(temporary);
  }
}

export function encryptionEnabled(
  directory: string,
  source: Record<string, string | undefined> = environment(),
): boolean {
  const setting = environment(source).NIVRA_ENCRYPTION_ENABLED;
  if (setting && setting !== "true" && setting !== "false")
    throw new Error("NIVRA_ENCRYPTION_ENABLED must be true or false.");
  const requested = setting ? setting === "true" : undefined;
  const file = path.join(
    /* turbopackIgnore: true */ directory,
    "encryption-mode.json",
  );
  function read() {
    const mode: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      !mode ||
      typeof mode !== "object" ||
      !("version" in mode) ||
      mode.version !== 1 ||
      !("encrypted" in mode) ||
      typeof mode.encrypted !== "boolean" ||
      Object.keys(mode).length !== 2
    )
      throw new Error(
        "The saved encryption mode is invalid. Restore it from a verified backup.",
      );
    if (requested !== undefined && requested !== mode.encrypted)
      throw new Error(
        "NIVRA_ENCRYPTION_ENABLED conflicts with this installation's saved mode. It can only be chosen for a new installation.",
      );
    return mode.encrypted;
  }
  if (fs.existsSync(file)) return read();
  const databases = ["nivra.sqlite", historicalDatabaseName];
  const existing =
    databases.some((name) => {
      const file = path.join(/* turbopackIgnore: true */ directory, name);
      return fs.existsSync(file) && fs.statSync(file).size > 0;
    }) ||
    fs.existsSync(
      path.join(/* turbopackIgnore: true */ directory, "auth.secret"),
    ) ||
    (fs.existsSync(
      path.join(/* turbopackIgnore: true */ directory, "uploads"),
    ) &&
      fs.readdirSync(
        path.join(/* turbopackIgnore: true */ directory, "uploads"),
      ).length > 0);
  if (existing && requested === false)
    throw new Error(
      "Encryption can only be disabled before a new installation's first startup. Existing data is unchanged.",
    );
  persistEncryptionMode(directory, requested ?? true);
  return read();
}
