ALTER TABLE tasks ADD COLUMN trashed_at INTEGER;
ALTER TABLE bookmarks ADD COLUMN trashed_at INTEGER;
ALTER TABLE artifacts ADD COLUMN trashed_at INTEGER;
CREATE INDEX tasks_trash_idx ON tasks(owner_id,trashed_at DESC,id) WHERE trashed_at IS NOT NULL;
CREATE INDEX bookmarks_trash_idx ON bookmarks(owner_id,trashed_at DESC,id) WHERE trashed_at IS NOT NULL;
CREATE INDEX artifacts_trash_idx ON artifacts(owner_id,trashed_at DESC,id) WHERE trashed_at IS NOT NULL;
