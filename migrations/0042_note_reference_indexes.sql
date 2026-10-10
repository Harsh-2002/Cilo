CREATE INDEX tasks_note_reference_idx ON tasks(note_id) WHERE note_id IS NOT NULL;
CREATE INDEX bookmarks_note_reference_idx ON bookmarks(note_id) WHERE note_id IS NOT NULL;
CREATE INDEX attachments_note_reference_idx ON attachments(note_id);
