import SwaggerParser from "@apidevtools/swagger-parser";
import { openApiDocument } from "../src/lib/server/api-contract";
async function main() {
  await SwaggerParser.validate(
    openApiDocument() as unknown as SwaggerParser["api"],
    { resolve: { external: false } },
  );
  console.log("OpenAPI document and internal references are valid.");
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
