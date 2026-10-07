DROP INDEX tasks_page_idx;
CREATE INDEX tasks_page_idx ON tasks(owner_id, created_at DESC, id DESC) WHERE trashed_at IS NULL;
