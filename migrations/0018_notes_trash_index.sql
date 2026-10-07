CREATE INDEX notes_trash_idx ON notes(owner_id,trashed_at DESC,id) WHERE trashed_at IS NOT NULL AND kind='note';
