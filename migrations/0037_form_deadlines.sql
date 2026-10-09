ALTER TABLE forms ADD COLUMN closing_date TEXT;
ALTER TABLE forms ADD COLUMN closing_timezone TEXT;
ALTER TABLE forms ADD COLUMN closes_at INTEGER;
CREATE INDEX forms_calendar_deadlines ON forms(owner_id,trashed_at,closes_at);
CREATE INDEX form_responses_activity ON form_responses(created_at,form_id) WHERE trashed_at IS NULL;
