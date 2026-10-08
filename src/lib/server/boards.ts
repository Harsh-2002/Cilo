import { randomUUID } from "node:crypto";
import { sqlite, db } from "./db";
import { taskBoards } from "./schema";
import { HttpError } from "./http";
import { decodeCursor, encodeCursor } from "./pagination";
import type { Board, Page } from "../types";
import type { TaskStage } from "../boards";

export const stagePredicate = (stage: TaskStage, alias = "t") =>
  stage === "done"
    ? `${alias}.completed_at IS NOT NULL`
    : `${alias}.completed_at IS NULL AND ${alias}.open_stage='${stage}'`;
const fields =
  "id,name,archived_at AS archivedAt,revision,created_at AS createdAt,updated_at AS updatedAt";
export function requireBoard(
  owner: string,
  id: string,
  allowArchived = false,
): Board {
  const row = sqlite()
    .prepare(`SELECT ${fields} FROM task_boards WHERE owner_id=? AND id=?`)
    .get(owner, id) as Board | undefined;
  if (!row) throw new HttpError(404, "This board was not found.");
  if (row.archivedAt !== null && !allowArchived)
    throw new HttpError(409, "Reopen this board before adding tasks.");
  return row;
}
export function boardCounts(owner: string, id: string, query = "") {
  const term = query.trim().slice(0, 300);
  const match = term
    .match(/[\p{L}\p{N}_]+/gu)
    ?.slice(0, 8)
    .map((w) => `"${w}"*`)
    .join(" AND ");
  const search = term
    ? match
      ? " AND t.rowid IN (SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH ?)"
      : " AND 0=1"
    : "";
  const indexes = {
    todo: "tasks_board_todo_idx",
    in_progress: "tasks_board_progress_idx",
    done: "tasks_board_done_idx",
  };
  return Object.fromEntries(
    (["todo", "in_progress", "done"] as const).map((stage) => [
      stage,
      (
        sqlite()
          .prepare(
            `SELECT count(*) AS total FROM tasks t INDEXED BY ${indexes[stage]} WHERE t.owner_id=? AND t.board_id=? AND t.trashed_at IS NULL AND ${stagePredicate(stage)}${search}`,
          )
          .get(owner, id, ...(term && match ? [match] : [])) as {
          total: number;
        }
      ).total,
    ]),
  ) as Record<TaskStage, number>;
}
export function getBoard(owner: string, id: string, query = "") {
  return {
    ...requireBoard(owner, id, true),
    counts: boardCounts(owner, id, query),
  };
}
export function listBoards(
  owner: string,
  archived: boolean,
  limit: number,
  after: string | null,
  query = "",
): Page<Board> {
  const cursor = decodeCursor(after, ["string", "string"]);
  const where = [
    "owner_id=?",
    archived ? "archived_at IS NOT NULL" : "archived_at IS NULL",
  ];
  const args: (string | number)[] = [owner];
  if (query.trim()) {
    where.push("instr(nivra_fold(name),nivra_fold(?))>0");
    args.push(query.trim().slice(0, 80));
  }
  if (cursor) {
    where.push("(name,id)>(?,?)");
    args.push(...cursor);
  }
  const rows = sqlite()
    .prepare(
      `SELECT ${fields} FROM task_boards WHERE ${where.join(" AND ")} ORDER BY name,id LIMIT ?`,
    )
    .all(...args, limit + 1) as Board[];
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    next:
      rows.length > limit && last ? encodeCursor([last.name, last.id]) : null,
  };
}
export function createBoard(owner: string, name: string): Board {
  const now = Date.now();
  return db()
    .insert(taskBoards)
    .values({
      id: randomUUID(),
      ownerId: owner,
      name,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}
export function updateBoard(
  owner: string,
  id: string,
  input: { revision: number; name?: string; archived?: boolean },
): Board {
  return sqlite()
    .transaction(() => {
      const previous = requireBoard(owner, id, true);
      if (previous.revision !== input.revision)
        throw new HttpError(
          409,
          "This board changed. Reload it and try again.",
        );
      sqlite()
        .prepare(
          "UPDATE task_boards SET name=?,archived_at=?,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND revision=?",
        )
        .run(
          input.name ?? previous.name,
          input.archived === undefined
            ? previous.archivedAt
            : input.archived
              ? Date.now()
              : null,
          Date.now(),
          owner,
          id,
          input.revision,
        );
      return requireBoard(owner, id, true);
    })
    .immediate();
}
export function insertionPosition(
  owner: string,
  boardId: string | null,
  stage: TaskStage,
  excludeId: string,
  beforeId?: string | null,
): number {
  if (!boardId) return 0;
  const database = sqlite();
  const where = `owner_id=? AND board_id=? AND trashed_at IS NULL AND ${stagePredicate(stage, "tasks")} AND id<>?`;
  const args = [owner, boardId, excludeId];
  const position = (before: string | null | undefined): number => {
    if (before === undefined || before === null) {
      const row = database
        .prepare(
          `SELECT board_position AS position FROM tasks WHERE ${where} ORDER BY board_position ${before === null ? "DESC" : "ASC"},id LIMIT 1`,
        )
        .get(...args) as { position: number } | undefined;
      return row ? row.position + (before === null ? 1024 : -1024) : 0;
    }
    const anchor = database
      .prepare(
        `SELECT board_position AS position,id FROM tasks WHERE ${where} AND id=?`,
      )
      .get(...args, before) as { position: number; id: string } | undefined;
    if (!anchor)
      throw new HttpError(
        409,
        "The destination task moved. Reload the board and try again.",
      );
    const left = database
      .prepare(
        `SELECT board_position AS position FROM tasks WHERE ${where} AND (board_position,id)<(?,?) ORDER BY board_position DESC,id DESC LIMIT 1`,
      )
      .get(...args, anchor.position, anchor.id) as
      { position: number } | undefined;
    return left
      ? (left.position + anchor.position) / 2
      : anchor.position - 1024;
  };
  let result = position(beforeId);
  const collision = () =>
    database
      .prepare(`SELECT 1 FROM tasks WHERE ${where} AND board_position=?`)
      .get(...args, result);
  if (!Number.isFinite(result) || collision()) {
    database
      .prepare(
        `WITH ranks AS (SELECT id,row_number() OVER (ORDER BY board_position,id)*1024 AS p FROM tasks WHERE ${where}) UPDATE tasks SET board_position=(SELECT p FROM ranks WHERE ranks.id=tasks.id) WHERE id IN (SELECT id FROM ranks)`,
      )
      .run(...args);
    result = position(beforeId);
  }
  return result;
}
