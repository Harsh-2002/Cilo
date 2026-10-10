CREATE INDEX notes_journal_page_idx ON notes(owner_id,daily_date DESC,id,title) WHERE trashed_at IS NULL AND kind='note';
CREATE INDEX notes_title_page_idx ON notes(owner_id,title COLLATE NOCASE,id,daily_date) WHERE trashed_at IS NULL AND kind='note';
