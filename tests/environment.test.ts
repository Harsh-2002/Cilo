import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "../src/lib/server/environment";
import { deriveKey } from "../src/lib/server/encryption";
import { hkdfSync } from "node:crypto";
import { readerUrl } from "../src/lib/reader";
test("new configuration wins while legacy configuration and encrypted derivation remain compatible", () => {
  const old = { CILO_DATA_DIR: "/legacy", CILO_STORAGE_BACKEND: "s3" };
  assert.equal(environment(old).NIVRA_DATA_DIR, "/legacy");
  assert.equal(
    environment({ ...old, NIVRA_DATA_DIR: "/current" }).NIVRA_DATA_DIR,
    "/current",
  );
  assert.equal(environment({ ...old, NIVRA_DATA_DIR: "" }).NIVRA_DATA_DIR, "");
  assert.deepEqual(old, {
    CILO_DATA_DIR: "/legacy",
    CILO_STORAGE_BACKEND: "s3",
  });
  const key = Buffer.alloc(32, 42);
  assert.deepEqual(
    deriveKey(key, "sqlite"),
    Buffer.from(hkdfSync("sha256", key, "cilo/v1", "sqlite", 32)),
  );
  const id = "11111111-1111-1111-1111-111111111111";
  for (const name of ["nivra", "cilo"])
    assert.equal(
      readerUrl(`/api/${name}/files/${id}`, true),
      `/api/${name}/files/${id}`,
    );
});
