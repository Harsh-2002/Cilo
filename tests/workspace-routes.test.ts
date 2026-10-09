import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanWorkspaceUrl,
  formRoute,
  workspaceView,
} from "../src/lib/workspace-routes";

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
    "forms",
  ]) {
    const url = cleanWorkspaceUrl(
      new URL(
        `https://example.com/${path}?date=2026-08-27&view=month&mode=planning`,
      ),
    );
    assert.equal(url.search, "", path);
  }
});
test("Forms deep links preserve their destination and reject invalid shapes", () => {
  const id = "f931d930-2b9c-44c8-93de-1e270f31c6ed";
  for (const tab of ["build", "responses", "share"] as const) {
    const path = `/forms/${id}/${tab}`;
    assert.equal(workspaceView(path), "forms");
    assert.deepEqual(formRoute(path), { id, tab });
    const cleaned = cleanWorkspaceUrl(
      new URL(`${path}?note=irrelevant&date=2026-10-10`, "https://example.com"),
    );
    assert.equal(cleaned.pathname, path);
    assert.equal(cleaned.search, tab === "responses" ? "?date=2026-10-10" : "");
  }
  assert.equal(formRoute(`/forms/${id}/build/${id}`), null);
  assert.equal(workspaceView("/forms/not-a-uuid/build"), null);
  assert.equal(workspaceView(`/forms/${id}/unknown`), null);
  assert.deepEqual(formRoute(`/forms/${id}/responses/${id}`), {
    id,
    tab: "responses",
    responseId: id,
  });
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
