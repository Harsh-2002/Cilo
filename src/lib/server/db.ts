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

export const dataDir = path.resolve(
  /* turbopackIgnore: true */ process.env.CILO_DATA_DIR || "./data",
);
const globalDb = globalThis as unknown as { ciloSqlite?: Database.Database };
export function sqlite() {
  if (!globalDb.ciloSqlite) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const file = path.join(/* turbopackIgnore: true */ dataDir, "cilo.sqlite");
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
    const key = deriveKey(
      masterKey(dataDir, exists && !plaintext),
      "sqlite",
    ).toString("hex");
    const connection = new Database(file);
    try {
      connection.pragma("cipher = 'chacha20'");
      if (connection.pragma("cipher", { simple: true }) !== "chacha20") {
        connection.close();
        throw new Error("Cilo requires an encryption-enabled SQLite driver.");
      }
      if (!plaintext) connection.pragma(`key = '${key}'`);
      connection.prepare("SELECT count(*) FROM sqlite_master").get();
      connection.pragma("temp_store = MEMORY");
      connection.pragma("foreign_keys = ON");
      connection.pragma("busy_timeout = 5000");
      connection.function("cilo_fold", { deterministic: true }, (value) =>
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
      if (plaintext) {
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
      globalDb.ciloSqlite = connection;
    } catch (error) {
      if (connection.open) connection.close();
      throw error;
    }
  }
  return globalDb.ciloSqlite;
}
export function db() {
  return drizzle(sqlite(), { schema });
}
