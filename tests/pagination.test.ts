import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("tasks and bookmarks page by stable cursors with server-side filters", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cilo-pagination-"));
  process.env.CILO_DATA_DIR = directory;
  const routes = await import("../src/app/api/cilo/[...path]/route");
  const { sqlite } = await import("../src/lib/server/db");
  let cookie = "";
  const call = (
    route: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) =>
    routes.GET(
      new Request(`http://localhost:3000/api/cilo/${route}`, {
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
        name: "Paging Owner",
        username: "paging",
        password: `Test-${randomUUID()}`,
      },
      false,
    );
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const owner = sqlite().prepare("SELECT id FROM user LIMIT 1").get() as {
      id: string;
    };
    const insertTask = sqlite().prepare(
      "INSERT INTO tasks(id,owner_id,title,completed_at,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    );
    const insertBookmark = sqlite().prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,collection,favorite,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    );
    sqlite().transaction(() => {
      for (let i = 0; i < 130; i++) {
        const dated = i % 7 === 0;
        insertTask.run(
          `task-${String(i).padStart(3, "0")}`,
          owner.id,
          i === 7 ? "École des tâches" : `Task number ${i}`,
          i % 5 === 0 ? 1000 + i : null,
          dated ? (i % 14 === 0 ? "2026-10-01" : "2026-10-20") : null,
          // Repeated creation times prove that ties page by identifier.
          Math.floor(i / 3),
          1,
        );
        insertBookmark.run(
          `mark-${String(i).padStart(3, "0")}`,
          owner.id,
          `https://example.invalid/${i}`,
          i === 11 ? "Concurrency handbook" : `Reference ${i}`,
          i % 4 === 0 ? "Reading" : "",
          i % 6 === 0 ? 1 : 0,
          Math.floor(i / 2),
          1,
        );
      }
    })();
    const walk = async (route: string) => {
      const ids: string[] = [];
      let pages = 0;
      let after = "";
      for (;;) {
        const page = await value(
          `${route}${route.includes("?") ? "&" : "?"}limit=25${after}`,
        );
        pages++;
        ids.push(...page.items.map((item: { id: string }) => item.id));
        if (!page.next) break;
        after = `&after=${encodeURIComponent(page.next)}`;
      }
      return { ids, pages };
    };
    await t.test(
      "requires authentication and rejects bad parameters",
      async () => {
        assert.equal(
          (await call("tasks", "GET", undefined, false)).status,
          401,
        );
        assert.equal(
          (await call("bookmarks", "GET", undefined, false)).status,
          401,
        );
        for (const route of [
          "tasks?filter=everything",
          "tasks?today=2026-02-30",
          "tasks?after=not-a-cursor",
          `tasks?after=${Buffer.from(JSON.stringify([1, 2, 3])).toString("base64url")}`,
          "bookmarks?after=%7B",
        ])
          assert.equal((await call(route)).status, 400, route);
      },
    );
    await t.test(
      "tasks page in due-date order without gaps or repeats",
      async () => {
        const open = await walk("tasks?filter=open&today=2026-10-05");
        const unique = new Set(open.ids);
        assert.equal(unique.size, open.ids.length);
        assert.equal(open.ids.length, 130 - 26);
        assert.ok(open.pages > 3);
        const loaded = sqlite()
          .prepare(
            "SELECT id FROM tasks WHERE owner_id=? AND completed_at IS NULL ORDER BY COALESCE(due_date,'9999'),created_at,id",
          )
          .all(owner.id) as { id: string }[];
        assert.deepEqual(
          open.ids,
          loaded.map((row) => row.id),
        );
        const completed = await walk("tasks?filter=completed");
        assert.equal(completed.ids.length, 26);
        const today = await walk("tasks?filter=today&today=2026-10-05");
        assert.ok(today.ids.length > 0);
        const upcoming = await walk("tasks?filter=upcoming&today=2026-10-05");
        assert.ok(upcoming.ids.length > 0);
        const everything = new Set([...open.ids, ...completed.ids]);
        assert.equal(everything.size, 130);
        const { listTaskPage } = await import("../src/lib/server/tasks");
        const { listBookmarkPage } =
          await import("../src/lib/server/bookmarks");
        assert.equal(
          listTaskPage("another-owner", {
            filter: "open",
            query: "",
            today: "2026-10-05",
            limit: 100,
          }).items.length,
          0,
        );
        assert.equal(
          listBookmarkPage("another-owner", { limit: 100 }).items.length,
          0,
        );
        assert.deepEqual(await value("tasks?summary=1"), {
          open: 104,
          completed: 26,
        });
      },
    );
    await t.test("task cursors survive edits between pages", async () => {
      const first = await value("tasks?filter=open&limit=10&today=2026-10-05");
      assert.equal(first.items.length, 10);
      assert.ok(first.next);
      const target = first.items[0];
      await value(`tasks/${target.id}`, "PATCH", {
        revision: target.revision,
        completed: true,
      });
      const second = await value(
        `tasks?filter=open&limit=10&today=2026-10-05&after=${encodeURIComponent(first.next)}`,
      );
      assert.equal(second.items.length, 10);
      const seen = new Set(first.items.map((item: { id: string }) => item.id));
      assert.ok(
        second.items.every((item: { id: string }) => !seen.has(item.id)),
      );
    });
    await t.test("task search is server-side and Unicode-aware", async () => {
      const match = await value(
        `tasks?filter=open&q=${encodeURIComponent("école")}`,
      );
      assert.deepEqual(
        match.items.map((item: { title: string }) => item.title),
        ["École des tâches"],
      );
      assert.equal((await value("tasks?q=zzzz")).items.length, 0);
    });
    await t.test(
      "bookmarks page newest first with filters and summary",
      async () => {
        const all = await walk("bookmarks");
        assert.equal(new Set(all.ids).size, 130);
        assert.deepEqual(
          all.ids,
          (
            sqlite()
              .prepare(
                "SELECT id FROM bookmarks WHERE owner_id=? ORDER BY created_at DESC,id",
              )
              .all(owner.id) as { id: string }[]
          ).map((row) => row.id),
        );
        const reading = await walk("bookmarks?collection=Reading");
        assert.equal(reading.ids.length, 33);
        const unfiled = await walk("bookmarks?unfiled=1");
        assert.equal(unfiled.ids.length, 97);
        const favorites = await walk("bookmarks?favorite=1&collection=Reading");
        assert.deepEqual(
          favorites.ids,
          Array.from(
            { length: 11 },
            (_, n) => `mark-${String(120 - n * 12).padStart(3, "0")}`,
          ),
        );
        const found = await value("bookmarks?q=concurency");
        assert.equal(found.items[0].title, "Concurrency handbook");
        const summary = await value("bookmarks?summary=1&collection=Reading");
        assert.equal(summary.total, 33);
        assert.deepEqual(summary.collections, ["Reading"]);
        assert.equal((await value("bookmarks?summary=1&q=handbook")).total, 1);
      },
    );
    await t.test("page size is bounded", async () => {
      assert.equal((await value("bookmarks?limit=5000")).items.length, 100);
      assert.equal((await value("tasks?limit=-3")).items.length, 1);
    });
  } finally {
    sqlite().close();
    await rm(directory, { recursive: true, force: true });
  }
});
