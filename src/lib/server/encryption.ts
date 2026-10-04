import { runtimeFs } from "./runtime-fs";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
const {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = runtimeFs;
import path from "node:path";

const magic = Buffer.from("CILOENC1");
export function masterKey(
  directory: string,
  requireExisting = false,
  env: Record<string, string | undefined> = process.env,
): Buffer {
  if (env.CILO_ENCRYPTION_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(env.CILO_ENCRYPTION_KEY))
      throw new Error(
        "CILO_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.",
      );
    return Buffer.from(env.CILO_ENCRYPTION_KEY, "hex");
  }
  const file =
    env.CILO_ENCRYPTION_KEY_FILE ||
    path.join(/* turbopackIgnore: true */ directory, "encryption.key");
  if (!existsSync(file)) {
    if (requireExisting || env.CILO_ENCRYPTION_KEY_FILE)
      throw new Error(
        "The encryption key is missing. Restore the original key before starting Cilo.",
      );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      writeFileSync(file, randomBytes(32), {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      syncDirectory(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const key = readFileSync(file);
  if (key.length !== 32)
    throw new Error("The encryption key file must contain exactly 32 bytes.");
  if (!env.CILO_ENCRYPTION_KEY_FILE) chmodSync(file, 0o600);
  return key;
}
export function deriveKey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, "cilo/v1", purpose, 32));
}
export function isEncrypted(bytes: Uint8Array): boolean {
  return (
    bytes.length >= magic.length &&
    Buffer.from(bytes.subarray(0, magic.length)).equals(magic)
  );
}
export function seal(
  bytes: Uint8Array,
  master: Buffer,
  context: string,
): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(master, "files"),
    nonce,
  );
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([magic, nonce, cipher.getAuthTag(), encrypted]);
}
export function unseal(
  bytes: Uint8Array,
  master: Buffer,
  context: string,
): Buffer {
  if (!isEncrypted(bytes) || bytes.length < 36)
    throw new Error("Stored data is not a valid encrypted Cilo object.");
  const buffer = Buffer.from(bytes);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(master, "files"),
    buffer.subarray(8, 20),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(buffer.subarray(20, 36));
  try {
    return Buffer.concat([
      decipher.update(buffer.subarray(36)),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      "Stored data failed authentication. Check the encryption key and restore an intact backup.",
    );
  }
}
export function replaceFile(file: string, bytes: Uint8Array) {
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600, flush: true });
    renameSync(temporary, file);
    syncDirectory(path.dirname(file));
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
export function syncDirectory(directory: string) {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
