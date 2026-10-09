import { writeFileSync, readFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import { openApiDocument } from "../src/lib/server/api-contract";
async function main() {
  const target = "docs/openapi.json";
  const content = await format(JSON.stringify(openApiDocument()), {
    ...(await resolveConfig(target)),
    parser: "json",
  });
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== content)
      throw new Error("OpenAPI contract is stale. Run npm run api:generate.");
    console.log("OpenAPI contract matches the executable schemas.");
  } else writeFileSync(target, content);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
