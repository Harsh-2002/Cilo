import { readdirSync } from "node:fs";
import path from "node:path";
const root = path.resolve(".next/standalone");
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (
      (directory === root && entry.name === "data") ||
      [
        "encryption.key",
        "auth.secret",
        "cilo.sqlite",
        "cilo.sqlite-wal",
        "cilo.sqlite-shm",
      ].includes(entry.name)
    )
      throw new Error(
        "Private instance data was traced into the shipping artifact.",
      );
    if (entry.isDirectory()) inspect(file);
  }
}
inspect(root);
console.log("Shipping artifact excludes private instance data.");
