CREATE TRIGGER user_identity_immutable BEFORE UPDATE OF name,username,display_username,email ON user
WHEN NEW.name IS NOT OLD.name OR NEW.username IS NOT OLD.username OR NEW.display_username IS NOT OLD.display_username OR NEW.email IS NOT OLD.email
BEGIN
  SELECT RAISE(ABORT,'Account identity is fixed after setup.');
END;
