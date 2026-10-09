ALTER TABLE system_configuration ADD COLUMN local_profile TEXT REFERENCES storage_profiles(id);
