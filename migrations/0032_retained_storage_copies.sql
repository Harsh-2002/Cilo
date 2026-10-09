ALTER TABLE backup_archives ADD COLUMN verified_at INTEGER;
CREATE TABLE storage_copies (
  storage_key TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES storage_profiles(id),
  retained_at INTEGER NOT NULL,
  PRIMARY KEY(storage_key,profile_id)
);
