CREATE TABLE owner_setup (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  theme TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX owner_setup_expiry_idx ON owner_setup(expires_at);
CREATE TRIGGER passkey_keep_login_method BEFORE DELETE ON passkey
WHEN EXISTS(SELECT 1 FROM user WHERE id=old.user_id)
 AND (SELECT count(*) FROM passkey WHERE user_id=old.user_id)<=1
 AND NOT EXISTS(SELECT 1 FROM account WHERE user_id=old.user_id AND provider_id='credential' AND password IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT,'Add a password or another passkey before removing your last passkey.');
END;

CREATE UNIQUE INDEX account_one_password_per_user ON account(user_id) WHERE provider_id='credential';
