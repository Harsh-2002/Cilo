ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('note','template'));
ALTER TABLE notes ADD COLUMN daily_date TEXT;
CREATE UNIQUE INDEX notes_daily_owner_idx ON notes(owner_id,daily_date) WHERE daily_date IS NOT NULL;
ALTER TABLE instance ADD COLUMN templates_seeded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instance ADD COLUMN daily_template_id TEXT REFERENCES notes(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN due_date TEXT;
ALTER TABLE tasks ADD COLUMN recurrence TEXT CHECK(recurrence IN ('daily','weekly','monthly'));
ALTER TABLE tasks ADD COLUMN recurrence_day INTEGER;
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN note_id TEXT REFERENCES notes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX tasks_parent_idx ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX tasks_due_idx ON tasks(owner_id,due_date);
ALTER TABLE bookmarks ADD COLUMN note_id TEXT REFERENCES notes(id) ON DELETE SET NULL;
CREATE TABLE note_versions (
 id TEXT PRIMARY KEY,
 note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 document TEXT NOT NULL,
 revision INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX note_versions_note_idx ON note_versions(note_id,created_at DESC);
CREATE TABLE note_links (
 source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 target_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 PRIMARY KEY(source_id,target_id)
);
CREATE INDEX note_links_target_idx ON note_links(target_id);
INSERT OR IGNORE INTO note_links(source_id,target_id)
SELECT DISTINCT n.id,target.id FROM notes n,json_tree(n.document) j
JOIN notes target ON j.type='text' AND j.key='href' AND j.value='/?note='||target.id
WHERE n.id<>target.id;
CREATE VIRTUAL TABLE tasks_fts USING fts5(title,content='tasks',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
 INSERT INTO tasks_fts(rowid,title) VALUES(new.rowid,new.title);
END;
CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
 INSERT INTO tasks_fts(tasks_fts,rowid,title) VALUES('delete',old.rowid,old.title);
END;
CREATE TRIGGER tasks_fts_update AFTER UPDATE OF title ON tasks BEGIN
 INSERT INTO tasks_fts(tasks_fts,rowid,title) VALUES('delete',old.rowid,old.title);
 INSERT INTO tasks_fts(rowid,title) VALUES(new.rowid,new.title);
END;
INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE tasks_fts_vocab USING fts5vocab(tasks_fts,'row');
