CREATE TABLE search_terms(id INTEGER PRIMARY KEY,vocabulary TEXT NOT NULL,term TEXT NOT NULL,term_length INTEGER NOT NULL,documents INTEGER NOT NULL,UNIQUE(vocabulary,term));
CREATE INDEX search_terms_length_idx ON search_terms(vocabulary,term_length,term);
INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'notes',term,length(term),doc FROM notes_fts_vocab WHERE length(term) BETWEEN 3 AND 66;
INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'tasks',term,length(term),doc FROM tasks_fts_vocab WHERE length(term) BETWEEN 3 AND 66;
INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'bookmarks',term,length(term),doc FROM bookmarks_fts_vocab WHERE length(term) BETWEEN 3 AND 66;
INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'artifacts',term,length(term),doc FROM artifacts_fts_vocab WHERE length(term) BETWEEN 3 AND 66;
CREATE VIEW search_term_content AS SELECT id,(WITH RECURSIVE chars(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM chars WHERE n<length(term)) SELECT group_concat(substr(term,n,1),'|') FROM chars) AS encoded FROM search_terms;
CREATE VIRTUAL TABLE search_terms_fts USING fts5(encoded,content='search_term_content',content_rowid='id',tokenize='trigram case_sensitive 1');
CREATE TRIGGER search_terms_ai AFTER INSERT ON search_terms BEGIN
 INSERT INTO search_terms_fts(rowid,encoded) SELECT id,encoded FROM search_term_content WHERE id=new.id;
END;
CREATE TRIGGER search_terms_ad BEFORE DELETE ON search_terms BEGIN
 INSERT INTO search_terms_fts(search_terms_fts,rowid,encoded) SELECT 'delete',id,encoded FROM search_term_content WHERE id=old.id;
END;
INSERT INTO search_terms_fts(search_terms_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE notes_term_tokens USING fts5(text,content='',tokenize='unicode61');
CREATE VIRTUAL TABLE notes_term_tokens_vocab USING fts5vocab(notes_term_tokens,'instance');
CREATE TRIGGER notes_terms_ai AFTER INSERT ON notes BEGIN
 INSERT INTO notes_term_tokens(rowid,text) VALUES(2,coalesce(new.title,'') || ' ' || coalesce(new.text,''));
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'notes',term,length(term),1 FROM (SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;

 INSERT INTO notes_term_tokens(notes_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER notes_terms_ad AFTER DELETE ON notes BEGIN
 INSERT INTO notes_term_tokens(rowid,text) VALUES(1,coalesce(old.title,'') || ' ' || coalesce(old.text,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='notes' AND term IN (SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 DELETE FROM search_terms WHERE vocabulary='notes' AND documents=0 AND term IN (SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO notes_term_tokens(notes_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER notes_terms_au AFTER UPDATE OF title,text ON notes WHEN old.title IS NOT new.title OR old.text IS NOT new.text BEGIN
 INSERT INTO notes_term_tokens(rowid,text) VALUES(1,coalesce(old.title,'') || ' ' || coalesce(old.text,''));
 INSERT INTO notes_term_tokens(rowid,text) VALUES(2,coalesce(new.title,'') || ' ' || coalesce(new.text,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='notes' AND term IN (SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'notes',term,length(term),1 FROM (SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;
 DELETE FROM search_terms WHERE vocabulary='notes' AND documents=0 AND term IN (SELECT DISTINCT term FROM notes_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO notes_term_tokens(notes_term_tokens) VALUES('delete-all');
END;
CREATE VIRTUAL TABLE tasks_term_tokens USING fts5(text,content='',tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE tasks_term_tokens_vocab USING fts5vocab(tasks_term_tokens,'instance');
CREATE TRIGGER tasks_terms_ai AFTER INSERT ON tasks BEGIN
 INSERT INTO tasks_term_tokens(rowid,text) VALUES(2,coalesce(new.title,''));
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'tasks',term,length(term),1 FROM (SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;

 INSERT INTO tasks_term_tokens(tasks_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER tasks_terms_ad AFTER DELETE ON tasks BEGIN
 INSERT INTO tasks_term_tokens(rowid,text) VALUES(1,coalesce(old.title,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='tasks' AND term IN (SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 DELETE FROM search_terms WHERE vocabulary='tasks' AND documents=0 AND term IN (SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO tasks_term_tokens(tasks_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER tasks_terms_au AFTER UPDATE OF title ON tasks WHEN old.title IS NOT new.title BEGIN
 INSERT INTO tasks_term_tokens(rowid,text) VALUES(1,coalesce(old.title,''));
 INSERT INTO tasks_term_tokens(rowid,text) VALUES(2,coalesce(new.title,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='tasks' AND term IN (SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'tasks',term,length(term),1 FROM (SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;
 DELETE FROM search_terms WHERE vocabulary='tasks' AND documents=0 AND term IN (SELECT DISTINCT term FROM tasks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO tasks_term_tokens(tasks_term_tokens) VALUES('delete-all');
END;
CREATE VIRTUAL TABLE bookmarks_term_tokens USING fts5(text,content='',tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE bookmarks_term_tokens_vocab USING fts5vocab(bookmarks_term_tokens,'instance');
CREATE TRIGGER bookmarks_terms_ai AFTER INSERT ON bookmarks BEGIN
 INSERT INTO bookmarks_term_tokens(rowid,text) VALUES(2,coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.url,'') || ' ' || coalesce(new.collection,''));
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'bookmarks',term,length(term),1 FROM (SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;

 INSERT INTO bookmarks_term_tokens(bookmarks_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER bookmarks_terms_ad AFTER DELETE ON bookmarks BEGIN
 INSERT INTO bookmarks_term_tokens(rowid,text) VALUES(1,coalesce(old.title,'') || ' ' || coalesce(old.description,'') || ' ' || coalesce(old.url,'') || ' ' || coalesce(old.collection,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='bookmarks' AND term IN (SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 DELETE FROM search_terms WHERE vocabulary='bookmarks' AND documents=0 AND term IN (SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO bookmarks_term_tokens(bookmarks_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER bookmarks_terms_au AFTER UPDATE OF title,description,url,collection ON bookmarks WHEN old.title IS NOT new.title OR old.description IS NOT new.description OR old.url IS NOT new.url OR old.collection IS NOT new.collection BEGIN
 INSERT INTO bookmarks_term_tokens(rowid,text) VALUES(1,coalesce(old.title,'') || ' ' || coalesce(old.description,'') || ' ' || coalesce(old.url,'') || ' ' || coalesce(old.collection,''));
 INSERT INTO bookmarks_term_tokens(rowid,text) VALUES(2,coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.url,'') || ' ' || coalesce(new.collection,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='bookmarks' AND term IN (SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'bookmarks',term,length(term),1 FROM (SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;
 DELETE FROM search_terms WHERE vocabulary='bookmarks' AND documents=0 AND term IN (SELECT DISTINCT term FROM bookmarks_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO bookmarks_term_tokens(bookmarks_term_tokens) VALUES('delete-all');
END;
CREATE VIRTUAL TABLE artifacts_term_tokens USING fts5(text,content='',tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE artifacts_term_tokens_vocab USING fts5vocab(artifacts_term_tokens,'instance');
CREATE TRIGGER artifacts_terms_ai AFTER INSERT ON artifacts BEGIN
 INSERT INTO artifacts_term_tokens(rowid,text) VALUES(2,coalesce(new.title,'') || ' ' || coalesce(new.content,'') || ' ' || coalesce(new.name,''));
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'artifacts',term,length(term),1 FROM (SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;

 INSERT INTO artifacts_term_tokens(artifacts_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER artifacts_terms_ad AFTER DELETE ON artifacts BEGIN
 INSERT INTO artifacts_term_tokens(rowid,text) VALUES(1,coalesce(old.title,'') || ' ' || coalesce(old.content,'') || ' ' || coalesce(old.name,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='artifacts' AND term IN (SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 DELETE FROM search_terms WHERE vocabulary='artifacts' AND documents=0 AND term IN (SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO artifacts_term_tokens(artifacts_term_tokens) VALUES('delete-all');
END;
CREATE TRIGGER artifacts_terms_au AFTER UPDATE OF title,content,name ON artifacts WHEN old.title IS NOT new.title OR old.content IS NOT new.content OR old.name IS NOT new.name BEGIN
 INSERT INTO artifacts_term_tokens(rowid,text) VALUES(1,coalesce(old.title,'') || ' ' || coalesce(old.content,'') || ' ' || coalesce(old.name,''));
 INSERT INTO artifacts_term_tokens(rowid,text) VALUES(2,coalesce(new.title,'') || ' ' || coalesce(new.content,'') || ' ' || coalesce(new.name,''));
 UPDATE search_terms SET documents=documents-1 WHERE vocabulary='artifacts' AND term IN (SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO search_terms(vocabulary,term,term_length,documents) SELECT 'artifacts',term,length(term),1 FROM (SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=2 AND length(term) BETWEEN 3 AND 66 EXCEPT SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66) WHERE true ON CONFLICT(vocabulary,term) DO UPDATE SET documents=documents+1;
 DELETE FROM search_terms WHERE vocabulary='artifacts' AND documents=0 AND term IN (SELECT DISTINCT term FROM artifacts_term_tokens_vocab WHERE doc=1 AND length(term) BETWEEN 3 AND 66);
 INSERT INTO artifacts_term_tokens(artifacts_term_tokens) VALUES('delete-all');
END;
