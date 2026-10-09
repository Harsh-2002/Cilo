CREATE TABLE system_configuration (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 1,
  media_profile TEXT NOT NULL,
  s3_profile TEXT,
  backup_profile TEXT NOT NULL,
  upload_mib INTEGER NOT NULL DEFAULT 25 CHECK(upload_mib BETWEEN 1 AND 100),
  backup_hours INTEGER NOT NULL DEFAULT 24 CHECK(backup_hours BETWEEN 1 AND 8760),
  backup_keep INTEGER NOT NULL DEFAULT 7 CHECK(backup_keep BETWEEN 1 AND 365)
);
CREATE TABLE storage_profiles (
  id TEXT PRIMARY KEY,
  configuration BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE storage_locations (
  storage_key TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES storage_profiles(id),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
CREATE INDEX storage_locations_profile_idx ON storage_locations(profile_id,deleted);
CREATE TABLE storage_transfers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id),
  destination TEXT NOT NULL REFERENCES storage_profiles(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed')),
  copied INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  lease_token TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE storage_verifications (
  token_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id),
  configuration BLOB NOT NULL,
  revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
