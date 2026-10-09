import assert from "node:assert/strict";
import test from "node:test";
import { cleanWorkspaceUrl } from "../src/lib/workspace-routes";

test("calendar parameters are removed from unrelated sections", () => {
  for (const path of [
    "overview",
    "notes",
    "journal",
    "favorites",
    "bookmarks",
    "artifacts",
    "trash",
    "tasks",
  ]) {
    const url = cleanWorkspaceUrl(
      new URL(
        `https://example.com/${path}?date=2026-08-27&view=month&mode=planning`,
      ),
    );
    assert.equal(url.search, "", path);
  }
});

test("section deep links retain their own state", () => {
  for (const path of [
    "/calendar?date=2026-08-27&view=month&mode=planning&event=event-id",
    "/tasks?view=board&board=board-id&stage=doing&task=task-id",
    "/notes?note=note-id&tag=tag-id",
    "/journal?note=journal-id",
    "/favorites?tag=tag-id",
  ]) {
    const url = cleanWorkspaceUrl(new URL(path, "https://example.com"));
    assert.equal(url.pathname + url.search, path);
  }
  assert.equal(
    cleanWorkspaceUrl(
      new URL(
        "https://example.com/tasks?view=board&date=2026-08-27&mode=planning",
      ),
    ).search,
    "?view=board",
  );
});
