CREATE TABLE publications (
  token TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  revision INTEGER NOT NULL,
  published_at INTEGER NOT NULL
);
CREATE TABLE publication_files (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL REFERENCES publications(token) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE
);
CREATE INDEX publication_files_token_idx ON publication_files(token);
