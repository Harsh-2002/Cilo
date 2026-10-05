CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image', 'file')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  thumb_key TEXT,
  extraction TEXT NOT NULL DEFAULT 'none' CHECK (extraction IN ('none', 'pending', 'done', 'failed')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX artifacts_page_idx ON artifacts(owner_id, created_at DESC, id);
CREATE INDEX artifacts_search_order_idx ON artifacts(owner_id, updated_at DESC, id, title);
CREATE INDEX artifacts_extraction_idx ON artifacts(extraction) WHERE extraction = 'pending';
CREATE VIRTUAL TABLE artifacts_fts USING fts5(title, content, name, content='artifacts', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE artifacts_fts_vocab USING fts5vocab(artifacts_fts, 'row');
CREATE TRIGGER artifacts_ai AFTER INSERT ON artifacts BEGIN
  INSERT INTO artifacts_fts(rowid,title,content,name) VALUES(new.rowid,new.title,new.content,new.name);
END;
CREATE TRIGGER artifacts_ad AFTER DELETE ON artifacts BEGIN
  INSERT INTO artifacts_fts(artifacts_fts,rowid,title,content,name) VALUES('delete',old.rowid,old.title,old.content,old.name);
END;
CREATE TRIGGER artifacts_au AFTER UPDATE ON artifacts BEGIN
  INSERT INTO artifacts_fts(artifacts_fts,rowid,title,content,name) VALUES('delete',old.rowid,old.title,old.content,old.name);
  INSERT INTO artifacts_fts(rowid,title,content,name) VALUES(new.rowid,new.title,new.content,new.name);
END;
