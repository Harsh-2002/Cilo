import { readdirSync } from "node:fs";
import path from "node:path";
const root = path.resolve(".next/standalone");
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (
      (directory === root && entry.name === "data") ||
      /\.sqlite(?:-(?:wal|shm))?$/.test(entry.name) ||
      [
        "encryption.key",
        "encryption-mode.json",
        "auth.secret",
        "nivra.sqlite",
        "nivra.sqlite-wal",
        "nivra.sqlite-shm",
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
