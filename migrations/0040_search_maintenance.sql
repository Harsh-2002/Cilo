DROP TRIGGER bookmarks_au;
CREATE TRIGGER bookmarks_au AFTER UPDATE OF title,description,url,collection ON bookmarks WHEN old.title IS NOT new.title OR old.description IS NOT new.description OR old.url IS NOT new.url OR old.collection IS NOT new.collection BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,description,url,collection) VALUES('delete',old.rowid,old.title,old.description,old.url,old.collection);
  INSERT INTO bookmarks_fts(rowid,title,description,url,collection) VALUES(new.rowid,new.title,new.description,new.url,new.collection);
END;
DROP TRIGGER artifacts_au;
CREATE TRIGGER artifacts_au AFTER UPDATE OF title,content,name ON artifacts WHEN old.title IS NOT new.title OR old.content IS NOT new.content OR old.name IS NOT new.name BEGIN
  INSERT INTO artifacts_fts(artifacts_fts,rowid,title,content,name) VALUES('delete',old.rowid,old.title,old.content,old.name);
  INSERT INTO artifacts_fts(rowid,title,content,name) VALUES(new.rowid,new.title,new.content,new.name);
END;
