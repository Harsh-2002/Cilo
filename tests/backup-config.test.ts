import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backupConfig,
  backupRepository,
} from "../src/lib/server/backup-repository";

test("backups default local and only the shared flag selects S3", () => {
  assert.equal(backupConfig({}).backend, "local");
  assert.equal(
    backupConfig({ NIVRA_S3_BACKUP_ENABLED: "false" }).backend,
    "local",
  );
  assert.equal(backupConfig({ NIVRA_S3_BACKUP_ENABLED: "true" }).backend, "s3");
  for (const value of ["1", "yes", "TRUE", " false "])
    assert.throws(
      () => backupConfig({ NIVRA_S3_BACKUP_ENABLED: value }),
      /true or false/,
    );
  assert.equal(backupConfig({ NIVRA_BACKUP_BACKEND: "s3" }).backend, "local");
  assert.equal(backupConfig({ NIVRA_BACKUP_BACKEND: "off" }).backend, "local");
});

test("shared S3 requires current credentials and protects the media namespace", () => {
  const shared = {
    NIVRA_S3_BACKUP_ENABLED: "true",
    NIVRA_S3_BUCKET: "fixture",
    NIVRA_S3_ACCESS_KEY_ID: "fixture",
    NIVRA_S3_SECRET_ACCESS_KEY: "fixture",
  };
  assert.doesNotThrow(() => backupRepository(shared));
  assert.throws(
    () =>
      backupRepository({
        NIVRA_S3_BACKUP_ENABLED: "true",
        NIVRA_BACKUP_S3_BUCKET: "old",
        NIVRA_BACKUP_S3_ACCESS_KEY_ID: "old",
        NIVRA_BACKUP_S3_SECRET_ACCESS_KEY: "old",
      }),
    /credentials/,
  );
  assert.throws(
    () => backupRepository({ ...shared, NIVRA_S3_ENDPOINT: "file:///tmp" }),
    /HTTP/,
  );
  assert.throws(
    () =>
      backupRepository({
        ...shared,
        NIVRA_STORAGE_BACKEND: "s3",
        NIVRA_BACKUP_PREFIX: "nivra/sub",
      }),
    /separate/,
  );
  assert.throws(
    () => backupRepository({ ...shared, NIVRA_BACKUP_PREFIX: "../escape" }),
    /prefix/,
  );
});
