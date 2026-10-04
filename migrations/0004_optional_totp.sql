ALTER TABLE user ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  verified INTEGER DEFAULT 1,
  failed_verification_count INTEGER DEFAULT 0,
  locked_until INTEGER
);
CREATE INDEX two_factor_user_idx ON two_factor(user_id);
CREATE INDEX two_factor_secret_idx ON two_factor(secret);
