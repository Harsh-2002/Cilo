CREATE INDEX notes_search_order_idx ON notes(owner_id, updated_at DESC, id, title) WHERE trashed_at IS NULL AND kind='note';
CREATE INDEX tasks_search_order_idx ON tasks(owner_id, updated_at DESC, id, title, completed_at);
CREATE INDEX bookmarks_search_order_idx ON bookmarks(owner_id, updated_at DESC, id, title);
