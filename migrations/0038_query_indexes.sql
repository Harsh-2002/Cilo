CREATE INDEX notes_active_counts_idx ON notes(owner_id,kind,daily_date,favorite,id,updated_at) WHERE trashed_at IS NULL;
CREATE INDEX tasks_active_counts_idx ON tasks(owner_id,completed_at,due_date,planned_date,id,updated_at) WHERE trashed_at IS NULL;
CREATE INDEX bookmarks_active_counts_idx ON bookmarks(owner_id,favorite,collection,id,updated_at) WHERE trashed_at IS NULL;
CREATE INDEX artifacts_active_counts_idx ON artifacts(owner_id,kind,id,updated_at) WHERE trashed_at IS NULL;
CREATE INDEX events_active_counts_idx ON calendar_events(owner_id,id,updated_at) WHERE trashed_at IS NULL;
CREATE INDEX forms_active_counts_idx ON forms(owner_id,favorite,id,updated_at) WHERE trashed_at IS NULL;
CREATE INDEX notes_activity_idx ON notes(owner_id,created_at DESC,id,title,revision,daily_date) WHERE trashed_at IS NULL;
CREATE INDEX tasks_completed_activity_idx ON tasks(owner_id,completed_at,id,title,revision) WHERE trashed_at IS NULL;
CREATE INDEX forms_page_idx ON forms(owner_id,created_at DESC,id DESC) WHERE trashed_at IS NULL;
CREATE INDEX notes_favorites_order_idx ON notes(owner_id,updated_at DESC,id,title,daily_date) WHERE trashed_at IS NULL AND favorite=1 AND kind='note';
CREATE INDEX bookmarks_favorites_order_idx ON bookmarks(owner_id,updated_at DESC,id,title) WHERE trashed_at IS NULL AND favorite=1;
CREATE INDEX forms_favorites_order_idx ON forms(owner_id,updated_at DESC,id,title) WHERE trashed_at IS NULL AND favorite=1;

DROP TRIGGER notes_search_generation_update;
CREATE TRIGGER notes_search_generation_update AFTER UPDATE OF title,text ON notes WHEN old.title IS NOT new.title OR old.text IS NOT new.text BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='notes';
END;
DROP TRIGGER bookmarks_search_generation_update;
CREATE TRIGGER bookmarks_search_generation_update AFTER UPDATE OF title,description,url,collection ON bookmarks WHEN old.title IS NOT new.title OR old.description IS NOT new.description OR old.url IS NOT new.url OR old.collection IS NOT new.collection BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='bookmarks';
END;
DROP TRIGGER artifacts_search_generation_update;
CREATE TRIGGER artifacts_search_generation_update AFTER UPDATE OF title,content,name ON artifacts WHEN old.title IS NOT new.title OR old.content IS NOT new.content OR old.name IS NOT new.name BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='artifacts';
END;

CREATE VIEW bookmark_literal_content AS SELECT rowid,lower(title || ' ' || description || ' ' || url || ' ' || collection) AS text FROM bookmarks;
CREATE VIRTUAL TABLE bookmarks_literal_fts USING fts5(text,content='bookmark_literal_content',content_rowid='rowid',tokenize='trigram case_sensitive 1');
CREATE TRIGGER bookmarks_literal_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_literal_fts(rowid,text) VALUES(new.rowid,lower(new.title || ' ' || new.description || ' ' || new.url || ' ' || new.collection));
END;
CREATE TRIGGER bookmarks_literal_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_literal_fts(bookmarks_literal_fts,rowid,text) VALUES('delete',old.rowid,lower(old.title || ' ' || old.description || ' ' || old.url || ' ' || old.collection));
END;
CREATE TRIGGER bookmarks_literal_au AFTER UPDATE OF title,description,url,collection ON bookmarks WHEN old.title IS NOT new.title OR old.description IS NOT new.description OR old.url IS NOT new.url OR old.collection IS NOT new.collection BEGIN
  INSERT INTO bookmarks_literal_fts(bookmarks_literal_fts,rowid,text) VALUES('delete',old.rowid,lower(old.title || ' ' || old.description || ' ' || old.url || ' ' || old.collection));
  INSERT INTO bookmarks_literal_fts(rowid,text) VALUES(new.rowid,lower(new.title || ' ' || new.description || ' ' || new.url || ' ' || new.collection));
END;
INSERT INTO bookmarks_literal_fts(bookmarks_literal_fts) VALUES('rebuild');

DROP INDEX notes_search_order_idx;
CREATE INDEX notes_search_order_idx ON notes(owner_id,updated_at DESC,id,title,daily_date) WHERE trashed_at IS NULL AND kind='note';
DROP INDEX tasks_search_order_idx;
CREATE INDEX tasks_search_order_idx ON tasks(owner_id,updated_at DESC,id,title,completed_at) WHERE trashed_at IS NULL;
DROP INDEX bookmarks_search_order_idx;
CREATE INDEX bookmarks_search_order_idx ON bookmarks(owner_id,updated_at DESC,id,title) WHERE trashed_at IS NULL;
DROP INDEX artifacts_search_order_idx;
CREATE INDEX artifacts_search_order_idx ON artifacts(owner_id,updated_at DESC,id,title,kind) WHERE trashed_at IS NULL;
