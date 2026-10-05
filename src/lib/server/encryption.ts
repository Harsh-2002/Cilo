import { environment } from "./environment";
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
  env: Record<string, string | undefined> = environment(),
): Buffer {
  env = environment(env);
  if (env.NIVRA_ENCRYPTION_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(env.NIVRA_ENCRYPTION_KEY))
      throw new Error(
        "NIVRA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.",
      );
    return Buffer.from(env.NIVRA_ENCRYPTION_KEY, "hex");
  }
  const file =
    env.NIVRA_ENCRYPTION_KEY_FILE ||
    path.join(/* turbopackIgnore: true */ directory, "encryption.key");
  if (!existsSync(file)) {
    if (requireExisting || env.NIVRA_ENCRYPTION_KEY_FILE)
      throw new Error(
        "The encryption key is missing. Restore the original key before starting Nivra.",
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
  if (!env.NIVRA_ENCRYPTION_KEY_FILE) chmodSync(file, 0o600);
  return key;
}
export function deriveKey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, "cilo/v1", purpose, 32));
}
const chunkedMagic = Buffer.from("CILOENC2");
export const chunkSize = 64 * 1024;
export const chunkedHeaderLength = 28;
const tagLength = 16;
const hasMagic = (bytes: Uint8Array, value: Buffer) =>
  bytes.length >= value.length &&
  Buffer.from(bytes.subarray(0, value.length)).equals(value);
export function isEncrypted(bytes: Uint8Array): boolean {
  return hasMagic(bytes, magic) || hasMagic(bytes, chunkedMagic);
}
export const isChunked = (bytes: Uint8Array) => hasMagic(bytes, chunkedMagic);
export const isSingleMessage = (bytes: Uint8Array) => hasMagic(bytes, magic);
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
export type ChunkedLayout = {
  chunkSize: number;
  chunks: number;
  size: number;
  salt: Buffer;
  key?: Buffer;
};
export function chunkedLayout(
  header: Uint8Array,
  storedSize: number,
): ChunkedLayout {
  const bytes = Buffer.from(header);
  const size = bytes.length >= 12 ? bytes.readUInt32BE(8) : 0;
  const body = storedSize - chunkedHeaderLength;
  if (
    !isChunked(bytes) ||
    bytes.length < chunkedHeaderLength ||
    size < 4096 ||
    size > 1024 * 1024 ||
    body < tagLength
  )
    throw new Error("Stored data is not a valid encrypted Nivra object.");
  const chunks = Math.ceil(body / (size + tagLength));
  return {
    chunkSize: size,
    chunks,
    size: body - chunks * tagLength,
    salt: bytes.subarray(12, 28),
  };
}
function chunkCipherKey(master: Buffer, salt: Uint8Array) {
  return Buffer.from(
    hkdfSync("sha256", deriveKey(master, "files"), salt, "cilo/chunk", 32),
  );
}
function chunkNonce(index: number, final: boolean) {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(index, 0);
  nonce[11] = final ? 1 : 0;
  return nonce;
}
// Chunks are authenticated individually with a final-chunk flag, so ranges verify without reading the whole object.
export function sealChunked(
  bytes: Uint8Array,
  master: Buffer,
  context: string,
): Buffer {
  const salt = randomBytes(16);
  const key = chunkCipherKey(master, salt);
  const aad = Buffer.from(context);
  const chunks = Math.max(1, Math.ceil(bytes.length / chunkSize));
  const header = Buffer.alloc(chunkedHeaderLength);
  chunkedMagic.copy(header);
  header.writeUInt32BE(chunkSize, 8);
  salt.copy(header, 12);
  const output = Buffer.allocUnsafe(
    chunkedHeaderLength + bytes.length + chunks * tagLength,
  );
  header.copy(output);
  let offset = chunkedHeaderLength;
  for (let index = 0; index < chunks; index++) {
    const cipher = createCipheriv(
      "aes-256-gcm",
      key,
      chunkNonce(index, index === chunks - 1),
    );
    cipher.setAAD(aad);
    const part = Buffer.from(
      bytes.subarray(index * chunkSize, (index + 1) * chunkSize),
    );
    offset += cipher.update(part).copy(output, offset);
    cipher.final();
    offset += cipher.getAuthTag().copy(output, offset);
  }
  return output;
}
export function openChunk(
  layout: ChunkedLayout,
  master: Buffer,
  context: string,
  index: number,
  stored: Uint8Array,
): Buffer {
  const buffer = Buffer.from(stored);
  if (buffer.length < tagLength)
    throw new Error("Stored data is not a valid encrypted Nivra object.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    (layout.key ||= chunkCipherKey(master, layout.salt)),
    chunkNonce(index, index === layout.chunks - 1),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(buffer.subarray(buffer.length - tagLength));
  try {
    return Buffer.concat([
      decipher.update(buffer.subarray(0, buffer.length - tagLength)),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      "Stored data failed authentication. Check the encryption key and restore an intact backup.",
    );
  }
}
export function unsealChunked(
  bytes: Uint8Array,
  master: Buffer,
  context: string,
): Buffer {
  const buffer = Buffer.from(bytes);
  const layout = chunkedLayout(buffer, buffer.length);
  const step = layout.chunkSize + tagLength;
  const parts: Buffer[] = [];
  for (let index = 0; index < layout.chunks; index++)
    parts.push(
      openChunk(
        layout,
        master,
        context,
        index,
        buffer.subarray(
          chunkedHeaderLength + index * step,
          chunkedHeaderLength + (index + 1) * step,
        ),
      ),
    );
  return Buffer.concat(parts);
}
export function unseal(
  bytes: Uint8Array,
  master: Buffer,
  context: string,
): Buffer {
  if (!isSingleMessage(bytes) || bytes.length < 36)
    throw new Error("Stored data is not a valid encrypted Nivra object.");
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
