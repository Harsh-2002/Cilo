import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
const previousName = String.fromCharCode(99, 105, 108, 111);
const names = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const extensions = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".css",
  ".html",
  ".svg",
  ".txt",
]);
const issues = [];
for (const name of names) {
  if (!existsSync(name)) continue;
  if (name.toLowerCase().includes(previousName))
    issues.push(`${name}: historical file name`);
  if (
    !extensions.has(path.extname(name)) &&
    !["Dockerfile", "LICENSE", ".env.example"].includes(name)
  )
    continue;
  if (readFileSync(name, "utf8").toLowerCase().includes(previousName))
    issues.push(`${name}: historical name in content`);
}
if (issues.length)
  throw new Error(`Branding verification failed:\n${issues.join("\n")}`);
console.log("Repository text and file names use Nivra.");
