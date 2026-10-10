import assert from "node:assert/strict";
import { storage } from "../../src/lib/server/storage";
import {
  profileSource,
  systemConfiguration,
} from "../../src/lib/server/system-configuration";

async function main() {
  assert.equal((await storage.read(process.argv[2])).toString(), "payload");
  assert.equal(
    profileSource(systemConfiguration().local_profile).NIVRA_DATA_DIR,
    process.env.NIVRA_DATA_DIR,
  );
  console.log("Relocated restore is readable");
}
void main().catch(() => {
  process.exitCode = 1;
});
