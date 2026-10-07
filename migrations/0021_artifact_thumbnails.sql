ALTER TABLE artifacts ADD COLUMN thumbnail_status TEXT NOT NULL DEFAULT 'none' CHECK(thumbnail_status IN ('none','pending','done','failed'));
UPDATE artifacts SET thumbnail_status='pending' WHERE storage_key IS NOT NULL AND (mime LIKE 'image/%' OR mime LIKE 'video/%' OR mime='application/pdf' OR mime LIKE 'application/vnd.openxmlformats-officedocument.%' OR mime LIKE 'application/vnd.oasis.opendocument.%');
CREATE INDEX artifacts_thumbnail_pending_idx ON artifacts(thumbnail_status) WHERE thumbnail_status='pending';
DROP TRIGGER artifacts_jobs_delete;
DROP TRIGGER bookmarks_jobs_delete;
CREATE TABLE background_jobs_new (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('artifact','bookmark','thumbnail')),
  target_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_until INTEGER,
  lease_token TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(kind,target_id)
);
INSERT INTO background_jobs_new SELECT * FROM background_jobs;
DROP TABLE background_jobs;
ALTER TABLE background_jobs_new RENAME TO background_jobs;
CREATE INDEX background_jobs_claim_idx ON background_jobs(state,available_at,lease_until);
CREATE TRIGGER artifacts_jobs_delete AFTER DELETE ON artifacts BEGIN
  DELETE FROM background_jobs WHERE kind IN ('artifact','thumbnail') AND target_id=old.id;
END;
CREATE TRIGGER bookmarks_jobs_delete AFTER DELETE ON bookmarks BEGIN
  DELETE FROM background_jobs WHERE kind='bookmark' AND target_id=old.id;
END;
INSERT INTO background_jobs(id,owner_id,kind,target_id,available_at,created_at)
  SELECT lower(hex(randomblob(16))),owner_id,'thumbnail',id,0,created_at FROM artifacts WHERE thumbnail_status='pending' AND trashed_at IS NULL;
