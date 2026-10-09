import { installationExists } from "./installation";
import { auth } from "./auth";
import { sqlite } from "./db";
import {
  workspaceView,
  workspaceSurface,
  formRoute,
} from "../workspace-routes";

type Query = Record<string, string | string[] | undefined>;
export async function workspacePageState(request: Request, query: Query = {}) {
  const pathname = new URL(request.url).pathname;
  const view = workspaceView(pathname);
  if (!view && !workspaceSurface(pathname)) return "missing";
  if (!installationExists()) return "missing";
  const database = sqlite();
  const owner = database.prepare("SELECT id FROM user LIMIT 1").get() as
    { id: string } | undefined;
  if (!owner) return "missing";
  const session = await auth(request).api.getSession({
    headers: request.headers,
  });
  if (!session || session.user.id !== owner.id) return "login";
  const form = formRoute(pathname);
  if (form) {
    if (
      !database
        .prepare(
          "SELECT id FROM forms WHERE id=? AND owner_id=? AND trashed_at IS NULL",
        )
        .get(form.id, owner.id)
    )
      return "missing";
    if (
      form.responseId &&
      !database
        .prepare(
          "SELECT id FROM form_responses WHERE id=? AND form_id=? AND trashed_at IS NULL",
        )
        .get(form.responseId, form.id)
    )
      return "missing";
  }
  const targets = [
    ...(view && ["all", "journal", "favorites"].includes(view)
      ? [["note", "notes", " AND trashed_at IS NULL"]]
      : []),
    ...(view === "tasks"
      ? [
          ["task", "tasks", " AND trashed_at IS NULL"],
          ["board", "task_boards", ""],
        ]
      : []),
    ...(view === "calendar"
      ? [["event", "calendar_events", " AND trashed_at IS NULL"]]
      : []),
  ];
  for (const [key, table, condition] of targets) {
    const id = query[key];
    if (
      id !== undefined &&
      (typeof id !== "string" ||
        !id ||
        !database
          .prepare(
            `SELECT id FROM ${table} WHERE id=? AND owner_id=?${condition}`,
          )
          .get(id, owner.id))
    )
      return "missing";
  }
  if (
    query.tag !== undefined &&
    view &&
    ["all", "journal", "favorites", "bookmarks", "artifacts"].includes(view)
  ) {
    if (
      typeof query.tag !== "string" ||
      !database.prepare("SELECT id FROM tags WHERE id=?").get(query.tag)
    )
      return "missing";
  }
  return "ready";
}
