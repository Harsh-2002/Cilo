import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db";

export interface StorageAdapter {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
const directory = path.join(dataDir, "uploads");
function file(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return path.join(directory, key);
}
export const storage: StorageAdapter = {
  async write(key, data) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(file(key), data, { flag: "wx", mode: 0o600 });
  },
  async read(key) {
    return readFile(file(key));
  },
  async delete(key) {
    await unlink(file(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  },
};
