ALTER TABLE notes ADD COLUMN editor_width TEXT NOT NULL DEFAULT 'standard' CHECK(editor_width IN ('standard', 'wide'));
