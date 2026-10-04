import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export const dataDir = path.resolve(
  /* turbopackIgnore: true */ process.env.CILO_DATA_DIR || "./data",
);
const globalDb = globalThis as unknown as { ciloSqlite?: Database.Database };
export function sqlite() {
  if (!globalDb.ciloSqlite) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const connection = new Database(path.join(dataDir, "cilo.sqlite"));
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    connection.pragma("busy_timeout = 5000");
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
    globalDb.ciloSqlite = connection;
  }
  return globalDb.ciloSqlite;
}
export function db() {
  return drizzle(sqlite(), { schema });
}
