CREATE INDEX note_tags_tag_idx ON note_tags(tag_id,note_id);
CREATE TABLE task_tags (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(task_id,tag_id));
CREATE INDEX task_tags_tag_idx ON task_tags(tag_id,task_id);
CREATE TABLE bookmark_tags (bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(bookmark_id,tag_id));
CREATE INDEX bookmark_tags_tag_idx ON bookmark_tags(tag_id,bookmark_id);
CREATE TABLE artifact_tags (artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(artifact_id,tag_id));
CREATE INDEX artifact_tags_tag_idx ON artifact_tags(tag_id,artifact_id);
