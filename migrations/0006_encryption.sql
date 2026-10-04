CREATE TABLE encryption_pending_files (storage_key TEXT PRIMARY KEY NOT NULL);
INSERT OR IGNORE INTO encryption_pending_files SELECT storage_key FROM attachments;
INSERT OR IGNORE INTO encryption_pending_files SELECT storage_key FROM publication_files;
