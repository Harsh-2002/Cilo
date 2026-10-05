CREATE INDEX tasks_page_idx ON tasks(owner_id, COALESCE(due_date, '9999'), created_at, id);
CREATE INDEX bookmarks_page_idx ON bookmarks(owner_id, created_at DESC, id);
