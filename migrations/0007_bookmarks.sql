CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  metadata_status TEXT NOT NULL DEFAULT 'unavailable',
  thumbnail_key TEXT,
  thumbnail_mime TEXT,
  icon_key TEXT,
  icon_mime TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id, url)
);
CREATE INDEX bookmarks_owner_created_idx ON bookmarks(owner_id, created_at);
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(title, description, url, collection, content='bookmarks', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE bookmarks_fts_vocab USING fts5vocab(bookmarks_fts, 'row');
CREATE TRIGGER bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid,title,description,url,collection) VALUES(new.rowid,new.title,new.description,new.url,new.collection);
END;
CREATE TRIGGER bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,description,url,collection) VALUES('delete',old.rowid,old.title,old.description,old.url,old.collection);
END;
CREATE TRIGGER bookmarks_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,description,url,collection) VALUES('delete',old.rowid,old.title,old.description,old.url,old.collection);
  INSERT INTO bookmarks_fts(rowid,title,description,url,collection) VALUES(new.rowid,new.title,new.description,new.url,new.collection);
END;
