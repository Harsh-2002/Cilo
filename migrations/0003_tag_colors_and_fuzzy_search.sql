ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT 'gray' CHECK(color IN ('gray','red','orange','yellow','green','blue','purple','pink'));
CREATE VIRTUAL TABLE notes_fts_vocab USING fts5vocab(notes_fts, 'row');
