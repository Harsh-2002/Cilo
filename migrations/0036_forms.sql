CREATE TABLE forms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL CHECK(json_valid(definition)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
  public_token TEXT UNIQUE,
  published_version_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  upload_budget INTEGER NOT NULL DEFAULT 262144000 CHECK(upload_budget >= 0),
  trashed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX forms_owner_active ON forms(owner_id,trashed_at,created_at DESC,id);
CREATE TABLE form_versions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  definition TEXT NOT NULL CHECK(json_valid(definition)),
  created_at INTEGER NOT NULL,
  UNIQUE(form_id,revision),
  UNIQUE(id,form_id)
);
CREATE TABLE form_responses (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  answers TEXT NOT NULL CHECK(json_valid(answers)),
  search_text TEXT NOT NULL DEFAULT '',
  retry_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  trashed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(version_id,form_id) REFERENCES form_versions(id,form_id),
  UNIQUE(form_id,retry_key),
  UNIQUE(id,form_id)
);
CREATE INDEX form_responses_list ON form_responses(form_id,trashed_at,created_at DESC,id);
CREATE INDEX form_responses_review ON form_responses(form_id,trashed_at,reviewed,created_at DESC,id);
CREATE TABLE form_upload_sessions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(version_id,form_id) REFERENCES form_versions(id,form_id),
  UNIQUE(id,form_id)
);
CREATE INDEX form_upload_sessions_expiry ON form_upload_sessions(expires_at);
CREATE TABLE form_files (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  session_id TEXT,
  response_id TEXT,
  field_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size >= 0),
  storage_key TEXT NOT NULL UNIQUE,
  thumb_key TEXT,
  thumbnail_status TEXT NOT NULL DEFAULT 'none' CHECK(thumbnail_status IN ('pending','done','none','failed')),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','writing','ready','attached','failed')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id,form_id) REFERENCES form_upload_sessions(id,form_id),
  FOREIGN KEY(response_id,form_id) REFERENCES form_responses(id,form_id)
);
CREATE INDEX form_files_budget ON form_files(form_id,state);
CREATE INDEX form_files_response ON form_files(response_id);
CREATE TABLE form_tags (
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(form_id,tag_id)
);
CREATE INDEX form_tags_tag ON form_tags(tag_id,form_id);
CREATE VIRTUAL TABLE forms_fts USING fts5(title,description,content='forms',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER forms_fts_insert AFTER INSERT ON forms BEGIN
  INSERT INTO forms_fts(rowid,title,description) VALUES(new.rowid,new.title,new.description);
END;
CREATE TRIGGER forms_fts_delete AFTER DELETE ON forms BEGIN
  INSERT INTO forms_fts(forms_fts,rowid,title,description) VALUES('delete',old.rowid,old.title,old.description);
END;
CREATE TRIGGER forms_fts_update AFTER UPDATE OF title,description ON forms BEGIN
  INSERT INTO forms_fts(forms_fts,rowid,title,description) VALUES('delete',old.rowid,old.title,old.description);
  INSERT INTO forms_fts(rowid,title,description) VALUES(new.rowid,new.title,new.description);
END;
CREATE VIRTUAL TABLE form_responses_fts USING fts5(search_text,content='form_responses',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER form_responses_fts_insert AFTER INSERT ON form_responses BEGIN
  INSERT INTO form_responses_fts(rowid,search_text) VALUES(new.rowid,new.search_text);
END;
CREATE TRIGGER form_responses_fts_delete AFTER DELETE ON form_responses BEGIN
  INSERT INTO form_responses_fts(form_responses_fts,rowid,search_text) VALUES('delete',old.rowid,old.search_text);
END;
CREATE TRIGGER form_versions_immutable BEFORE UPDATE ON form_versions BEGIN
  SELECT RAISE(ABORT,'Published form versions are immutable');
END;
CREATE TRIGGER form_responses_immutable BEFORE UPDATE OF form_id,version_id,answers,search_text,retry_key,request_hash,created_at ON form_responses BEGIN
  SELECT RAISE(ABORT,'Submitted form answers are immutable');
END;

CREATE TRIGGER form_files_jobs_delete AFTER DELETE ON form_files BEGIN
  DELETE FROM background_jobs WHERE kind='thumbnail' AND target_id=old.id;
END;

CREATE INDEX forms_search_order_idx ON forms(owner_id,updated_at DESC,id) WHERE trashed_at IS NULL;
