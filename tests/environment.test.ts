import {
  historicalConfigPrefix,
  historicalNamespace,
} from "../src/lib/compatibility";
import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "../src/lib/server/environment";
import { deriveKey } from "../src/lib/server/encryption";
import { hkdfSync } from "node:crypto";
import { readerUrl } from "../src/lib/reader";
test("only current environment names configure Nivra while established encrypted data remains readable", () => {
  const old = {
    [`${historicalConfigPrefix}DATA_DIR`]: "/legacy",
    [`${historicalConfigPrefix}STORAGE_BACKEND`]: "s3",
  };
  assert.equal(environment(old).NIVRA_DATA_DIR, undefined);
  assert.equal(
    environment({ ...old, NIVRA_DATA_DIR: "/current" }).NIVRA_DATA_DIR,
    "/current",
  );
  assert.equal(environment({ ...old, NIVRA_DATA_DIR: "" }).NIVRA_DATA_DIR, "");
  assert.deepEqual(old, {
    [`${historicalConfigPrefix}DATA_DIR`]: "/legacy",
    [`${historicalConfigPrefix}STORAGE_BACKEND`]: "s3",
  });
  assert.equal(environment(old).NIVRA_S3_PREFIX, undefined);
  assert.equal(environment(old).NIVRA_STORAGE_BACKEND, undefined);
  assert.equal(
    environment({ ...old, NIVRA_S3_PREFIX: "new/" }).NIVRA_S3_PREFIX,
    "new/",
  );
  const key = Buffer.alloc(32, 42);
  assert.deepEqual(
    deriveKey(key, "sqlite"),
    Buffer.from(
      hkdfSync(
        "sha256",
        key,
        Buffer.from([99, 105, 108, 111, 47, 118, 49]),
        "sqlite",
        32,
      ),
    ),
  );
  const id = "11111111-1111-1111-1111-111111111111";
  for (const name of ["nivra", historicalNamespace])
    assert.equal(
      readerUrl(`/api/${name}/files/${id}`, true),
      `/api/${name}/files/${id}`,
    );
});
