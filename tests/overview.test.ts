import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("overview is private, bounded, date-aware and reflects workspace changes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cilo-overview-"));
  process.env.CILO_DATA_DIR = directory;
  const routes = await import("../src/app/api/nivra/[...path]/route");
  const { sqlite, db } = await import("../src/lib/server/db");
  const { bookmarks } = await import("../src/lib/server/schema");
  const { workspaceOverview } = await import("../src/lib/server/overview");
  let cookie = "";
  const call = (
    route: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) =>
    routes.GET(
      new Request(`http://localhost:3000/api/nivra/${route}`, {
        method,
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          ...(authenticated ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ path: route.split("?")[0].split("/") }) },
    );
  const value = async (route: string, method = "GET", body?: unknown) => {
    const response = await call(route, method, body);
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  try {
    const setup = await call(
      "setup",
      "POST",
      {
        name: "Overview Owner",
        username: "overview",
        password: `Test-${randomUUID()}`,
      },
      false,
    );
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    await t.test(
      "requires owner authentication and a valid local calendar date",
      async () => {
        assert.equal(
          (await call("overview?date=2026-10-05", "GET", undefined, false))
            .status,
          401,
        );
        for (const date of ["2026-02-30", "wrong", "2026-10-05' OR 1=1"])
          assert.equal(
            (await call(`overview?date=${encodeURIComponent(date)}`)).status,
            400,
          );
        assert.equal((await call("overview")).status, 400);
        const response = await call("overview?date=2026-10-05");
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.deepEqual((await response.json()).counts, {
          open: 0,
          today: 0,
          overdue: 0,
        });
      },
    );
    const owner = (await value("status")).owner.id;
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const note = await value("notes", "POST", { title: `Note ${i}` });
      ids.push(note.id);
      sqlite()
        .prepare("UPDATE notes SET updated_at=? WHERE id=?")
        .run(100 + i, note.id);
    }
    await value("notes", "POST", { title: "Trashed recent note" }).then(
      (note) =>
        sqlite()
          .prepare("UPDATE notes SET trashed_at=?,updated_at=? WHERE id=?")
          .run(Date.now(), Date.now(), note.id),
    );
    for (let i = 0; i < 7; i++)
      db()
        .insert(bookmarks)
        .values({
          id: randomUUID(),
          ownerId: owner,
          url: `https://example.com/${i}`,
          title: `Bookmark ${i}`,
          description: "Saved description",
          siteName: "Example",
          createdAt: 100 + i,
          updatedAt: 100 + i,
        })
        .run();
    let recurring: { id: string; revision: number };
    for (const [title, dueDate] of [
      ["Undated", null],
      ["Future", "2026-10-20"],
      ["Overdue", "2026-10-01"],
      ["Today recurring", "2026-10-05"],
      ["Tomorrow", "2026-10-06"],
      ["Later", "2026-10-25"],
      ["Completed", "2026-10-05"],
    ] as const) {
      const task = await value("tasks", "POST", {
        title,
        dueDate,
        ...(title === "Today recurring" ? { recurrence: "daily" } : {}),
      });
      if (title === "Today recurring") recurring = task;
      if (title === "Completed")
        await value(`tasks/${task.id}`, "PATCH", {
          revision: task.revision,
          completed: true,
        });
    }
    await t.test(
      "caps recents, excludes trash, and sorts by latest edit",
      async () => {
        const snapshot = await value("overview?date=2026-10-05");
        assert.deepEqual(
          snapshot.notes.map((n: { title: string }) => n.title),
          ["Note 7", "Note 6", "Note 5", "Note 4", "Note 3"],
        );
        assert.deepEqual(
          snapshot.bookmarks.map((b: { title: string }) => b.title),
          ["Bookmark 6", "Bookmark 5", "Bookmark 4", "Bookmark 3"],
        );
        assert.ok(snapshot.refreshedAt > 0);
        assert.ok(
          snapshot.notes.every(
            (n: object) => !("document" in n) && !("text" in n),
          ),
        );
        assert.ok(snapshot.bookmarks.every((b: object) => !("ownerId" in b)));
      },
    );
    await t.test(
      "counts all open tasks and prioritizes due dates without including completed tasks",
      async () => {
        const snapshot = await value("overview?date=2026-10-05");
        assert.deepEqual(snapshot.counts, { open: 6, today: 1, overdue: 1 });
        assert.deepEqual(
          snapshot.tasks.map((task: { title: string }) => task.title),
          ["Overdue", "Today recurring", "Tomorrow", "Future", "Later"],
        );
        assert.deepEqual((await value("overview?date=2026-10-06")).counts, {
          open: 6,
          today: 1,
          overdue: 2,
        });
        assert.deepEqual(workspaceOverview(randomUUID(), "2026-10-05").counts, {
          open: 0,
          today: 0,
          overdue: 0,
        });
        assert.equal(
          workspaceOverview(randomUUID(), "2026-10-05").notes.length,
          0,
        );
        assert.equal(
          workspaceOverview(randomUUID(), "2026-10-05").bookmarks.length,
          0,
        );
      },
    );
    await t.test(
      "refresh includes edits and recurring successor after completion",
      async () => {
        await value(`tasks/${recurring!.id}`, "PATCH", {
          revision: recurring!.revision,
          completed: true,
        });
        await value(`notes/${ids[0]}`, "PATCH", {
          revision: 1,
          title: "Latest edited note",
        });
        const snapshot = await value("overview?date=2026-10-05");
        assert.equal(snapshot.notes[0].title, "Latest edited note");
        assert.deepEqual(snapshot.counts, { open: 6, today: 0, overdue: 1 });
        const next = snapshot.tasks.find(
          (task: { title: string }) => task.title === "Today recurring",
        );
        assert.ok(next);
        assert.notEqual(next.id, recurring!.id);
        assert.equal(next.dueDate, "2026-10-06");
      },
    );
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
