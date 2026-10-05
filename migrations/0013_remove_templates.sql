UPDATE notes SET kind='note', trashed_at=COALESCE(trashed_at, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE kind='template';
UPDATE instance SET daily_template_id=NULL, templates_seeded=1 WHERE id=1;
