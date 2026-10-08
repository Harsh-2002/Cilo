import { environment } from "./environment";
import { runtimeFs } from "./runtime-fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
const {
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
  readdirSync,
  statSync,
} = runtimeFs;
import path from "node:path";
import * as schema from "./schema";
import { deriveKey, masterKey } from "./encryption";
import { encryptionEnabled } from "./encryption-mode";

export const dataDir = path.resolve(
  /* turbopackIgnore: true */ environment().NIVRA_DATA_DIR || "./data",
);
export const databaseFile = path.join(dataDir, "nivra.sqlite");
const globalDb = globalThis as unknown as { nivraSqlite?: Database.Database };
export function sqlite() {
  if (!globalDb.nivraSqlite) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const encrypted = encryptionEnabled(dataDir);
    const file = databaseFile;
    const exists = existsSync(file) && statSync(file).size > 0;
    let plaintext = false;
    if (exists) {
      const descriptor = openSync(file, "r");
      try {
        const header = Buffer.alloc(16);
        readSync(descriptor, header, 0, 16, 0);
        plaintext = header.equals(Buffer.from("SQLite format 3\0"));
      } finally {
        closeSync(descriptor);
      }
    }
    const key = encrypted
      ? deriveKey(masterKey(dataDir, exists && !plaintext), "sqlite").toString(
          "hex",
        )
      : undefined;
    const connection = new Database(file);
    try {
      connection.pragma("cipher = 'chacha20'");
      if (connection.pragma("cipher", { simple: true }) !== "chacha20") {
        connection.close();
        throw new Error("Nivra requires an encryption-enabled SQLite driver.");
      }
      if (encrypted && !plaintext) connection.pragma(`key = '${key}'`);
      connection.prepare("SELECT count(*) FROM sqlite_master").get();
      connection.pragma("temp_store = MEMORY");
      connection.pragma("cache_size = -32768");
      connection.pragma("foreign_keys = ON");
      connection.pragma("busy_timeout = 5000");
      connection.function("nivra_fold", { deterministic: true }, (value) =>
        String(value ?? "").toLocaleLowerCase(),
      );
      connection.exec(
        "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
      );
      for (const name of readdirSync(path.resolve("migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        connection
          .transaction(() => {
            if (
              connection
                .prepare("SELECT 1 FROM migrations WHERE name = ?")
                .get(name)
            )
              return;
            connection.exec(
              readFileSync(path.resolve("migrations", name), "utf8"),
            );
            connection
              .prepare("INSERT INTO migrations VALUES (?, ?)")
              .run(name, Date.now());
          })
          .immediate();
      }
      if (plaintext && encrypted) {
        connection.pragma("wal_checkpoint(TRUNCATE)");
        connection.pragma("journal_mode = DELETE");
        connection.pragma(`rekey = '${key}'`);
        if (connection.pragma("integrity_check", { simple: true }) !== "ok") {
          connection.close();
          throw new Error(
            "Encrypted database migration failed integrity checks.",
          );
        }
      }
      connection.pragma("journal_mode = WAL");
      chmodSync(file, 0o600);
      globalDb.nivraSqlite = connection;
    } catch (error) {
      if (connection.open) connection.close();
      throw error;
    }
  }
  return globalDb.nivraSqlite;
}
export function db() {
  return drizzle(sqlite(), { schema });
}
