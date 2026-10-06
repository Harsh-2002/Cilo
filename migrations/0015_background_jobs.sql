CREATE TABLE background_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('artifact','bookmark')),
  target_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_until INTEGER,
  lease_token TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(kind,target_id)
);
CREATE INDEX background_jobs_claim_idx ON background_jobs(state,available_at,lease_until);
CREATE TABLE completion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('artifact','bookmark','backup')),
  target_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX completion_events_owner_idx ON completion_events(owner_id,id);
ALTER TABLE bookmarks ADD COLUMN title_edited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookmarks ADD COLUMN description_edited INTEGER NOT NULL DEFAULT 0;
UPDATE bookmarks SET title_edited=1,description_edited=1;
CREATE TRIGGER artifacts_jobs_delete AFTER DELETE ON artifacts BEGIN
  DELETE FROM background_jobs WHERE kind='artifact' AND target_id=old.id;
END;
CREATE TRIGGER bookmarks_jobs_delete AFTER DELETE ON bookmarks BEGIN
  DELETE FROM background_jobs WHERE kind='bookmark' AND target_id=old.id;
END;
INSERT INTO background_jobs(id,owner_id,kind,target_id,available_at,created_at)
  SELECT lower(hex(randomblob(16))),owner_id,'artifact',id,0,created_at FROM artifacts WHERE extraction='pending';
