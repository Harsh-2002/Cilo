CREATE TABLE backup_archives (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES storage_profiles(id),
  information TEXT NOT NULL
);
