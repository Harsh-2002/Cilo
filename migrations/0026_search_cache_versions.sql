CREATE TABLE search_versions (vocabulary TEXT PRIMARY KEY NOT NULL,generation INTEGER NOT NULL DEFAULT 0);
INSERT INTO search_versions(vocabulary) VALUES('notes'),('tasks'),('bookmarks'),('artifacts');
CREATE TRIGGER notes_search_generation_insert AFTER INSERT ON notes BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='notes';
END;
CREATE TRIGGER notes_search_generation_update AFTER UPDATE ON notes BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='notes';
END;
CREATE TRIGGER notes_search_generation_delete AFTER DELETE ON notes BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='notes';
END;
CREATE TRIGGER tasks_search_generation_insert AFTER INSERT ON tasks BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='tasks';
END;
CREATE TRIGGER tasks_search_generation_update AFTER UPDATE ON tasks BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='tasks';
END;
CREATE TRIGGER tasks_search_generation_delete AFTER DELETE ON tasks BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='tasks';
END;
CREATE TRIGGER bookmarks_search_generation_insert AFTER INSERT ON bookmarks BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='bookmarks';
END;
CREATE TRIGGER bookmarks_search_generation_update AFTER UPDATE ON bookmarks BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='bookmarks';
END;
CREATE TRIGGER bookmarks_search_generation_delete AFTER DELETE ON bookmarks BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='bookmarks';
END;
CREATE TRIGGER artifacts_search_generation_insert AFTER INSERT ON artifacts BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='artifacts';
END;
CREATE TRIGGER artifacts_search_generation_update AFTER UPDATE ON artifacts BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='artifacts';
END;
CREATE TRIGGER artifacts_search_generation_delete AFTER DELETE ON artifacts BEGIN
  UPDATE search_versions SET generation=generation+1 WHERE vocabulary='artifacts';
END;
