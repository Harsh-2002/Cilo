CREATE TABLE task_boards (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 archived_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX task_boards_owner_idx ON task_boards(owner_id,archived_at,name,id);
ALTER TABLE tasks ADD COLUMN board_id TEXT REFERENCES task_boards(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN open_stage TEXT NOT NULL DEFAULT 'todo' CHECK(open_stage IN ('todo','in_progress'));
ALTER TABLE tasks ADD COLUMN board_position REAL NOT NULL DEFAULT 0;
CREATE INDEX tasks_board_todo_idx ON tasks(owner_id,board_id,board_position,id) WHERE trashed_at IS NULL AND completed_at IS NULL AND open_stage='todo';
CREATE INDEX tasks_board_progress_idx ON tasks(owner_id,board_id,board_position,id) WHERE trashed_at IS NULL AND completed_at IS NULL AND open_stage='in_progress';
CREATE INDEX tasks_board_done_idx ON tasks(owner_id,board_id,board_position,id) WHERE trashed_at IS NULL AND completed_at IS NOT NULL;
CREATE INDEX tasks_board_recent_idx ON tasks(owner_id,board_id,created_at DESC,id DESC) WHERE trashed_at IS NULL;
DROP TRIGGER tasks_search_generation_update;
CREATE TRIGGER tasks_search_generation_update AFTER UPDATE OF title ON tasks WHEN old.title IS NOT new.title BEGIN
 UPDATE search_versions SET generation=generation+1 WHERE vocabulary='tasks';
END;
