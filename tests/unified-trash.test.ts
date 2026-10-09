import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

test("notes Trash upgrade avoids scanning active notes and journals", async () => {
  const connection = new Database(":memory:");
  try {
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql") && n < "0018")
      .sort())
      connection.exec(await readFile(path.join("migrations", name), "utf8"));
    connection.exec(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('owner','Owner','owner@local.invalid','owner',1,1); INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at,daily_date,trashed_at) VALUES('active','owner','Active','{}','Kept',1,1,NULL,NULL),('deleted','owner','Deleted journal','{}','Recover',1,1,'2026-10-07',10)",
    );
    const sql =
      "SELECT id,title FROM notes WHERE owner_id=? AND trashed_at IS NOT NULL AND kind='note' ORDER BY trashed_at DESC,id LIMIT 61";
    const before = connection.prepare(sql).all("owner");
    connection.exec(
      await readFile("migrations/0018_notes_trash_index.sql", "utf8"),
    );
    assert.deepEqual(connection.prepare(sql).all("owner"), before);
    const plan = connection
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all("owner") as {
      detail: string;
    }[];
    assert.ok(plan.some((row) => row.detail.includes("notes_trash_idx")));
    assert.ok(plan.every((row) => !row.detail.includes("TEMP B-TREE")));
    assert.equal(connection.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    connection.close();
  }
});

test("Trash migration preserves existing rows and marks no item deleted", async () => {
  const connection = new Database(":memory:");
  try {
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql") && n < "0016")
      .sort())
      connection.exec(await readFile(path.join("migrations", name), "utf8"));
    connection.exec(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('owner','Owner','owner@local.invalid','owner',1,1); INSERT INTO tasks(id,owner_id,title,created_at,updated_at) VALUES('task','owner','Existing task',1,1); INSERT INTO bookmarks(id,owner_id,url,title,created_at,updated_at) VALUES('bookmark','owner','https://example.com','Existing link',1,1); INSERT INTO artifacts(id,owner_id,kind,title,content,created_at,updated_at) VALUES('artifact','owner','text','Existing text','Preserved text',1,1)",
    );
    connection.exec(
      await readFile("migrations/0016_unified_trash.sql", "utf8"),
    );
    for (const table of ["tasks", "bookmarks", "artifacts"])
      assert.equal(
        (
          connection
            .prepare(
              `SELECT count(*) AS n FROM ${table} WHERE trashed_at IS NULL AND revision=1`,
            )
            .get() as { n: number }
        ).n,
        1,
      );
    assert.equal(
      (
        connection.prepare("SELECT content FROM artifacts").get() as {
          content: string;
        }
      ).content,
      "Preserved text",
    );
    assert.equal(connection.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    connection.close();
  }
});

test("unified Trash authorizes, isolates, restores and permanently deletes every item type", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-trash-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { listTrash, moveToTrash, restoreTrash, deleteTrash } =
    await import("../src/lib/server/trash");
  const { listTasks, updateTask } = await import("../src/lib/server/tasks");
  const { listBookmarks } = await import("../src/lib/server/bookmarks");
  const { listArtifactPage, getArtifact } =
    await import("../src/lib/server/artifacts");
  const { searchWorkspace } = await import("../src/lib/server/unified-search");
  const { workspaceOverview } = await import("../src/lib/server/overview");
  const { storage } = await import("../src/lib/server/storage");
  const { stopJobWorker, enqueueJob, claimJob, commitJob } =
    await import("../src/lib/server/jobs");
  const routes = await import("../src/app/api/v1/[...path]/route");
  const db = sqlite(),
    owner = randomUUID();
  try {
    db.prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).run(owner, "Trash fixture", "trash@local.invalid", "trash");
    const ids = Object.fromEntries(
      ["note", "journal", "task", "bookmark", "artifact"].map((kind) => [
        kind,
        randomUUID(),
      ]),
    );
    for (const kind of ["note", "journal"])
      db.prepare(
        "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at,daily_date,trashed_at) VALUES(?,?,?,'{\"schemaVersion\":1,\"blocks\":[]}','recoveryword',1,1,?,10)",
      ).run(
        ids[kind],
        owner,
        `recoveryword ${kind}`,
        kind === "journal" ? "2026-10-06" : null,
      );
    db.prepare(
      "INSERT INTO tasks(id,owner_id,title,created_at,updated_at,due_date,recurrence) VALUES(?,?,'recoveryword task',1,1,'2026-10-06','daily')",
    ).run(ids.task, owner);
    db.prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,created_at,updated_at) VALUES(?,?,'https://example.com','recoveryword bookmark',1,1)",
    ).run(ids.bookmark, owner);
    const key = randomUUID(),
      bytes = Buffer.from("retained encrypted original");
    await storage.write(key, bytes);
    db.prepare(
      "INSERT INTO artifacts(id,owner_id,kind,title,content,name,mime,storage_key,created_at,updated_at) VALUES(?,?,'file','recoveryword artifact','extracted text','original.txt','text/plain',?,1,1)",
    ).run(ids.artifact, owner, key);
    enqueueJob(owner, "artifact", ids.artifact);
    const leased = claimJob()!;
    for (const kind of ["task", "bookmark", "artifact"] as const)
      moveToTrash(owner, kind, ids[kind], 1);
    assert.equal(
      commitJob(leased, () => {
        throw new Error("Deleted job must not commit");
      }),
      false,
    );
    assert.equal(listTrash(owner, "", undefined).items.length, 5);
    assert.equal(listTrash("different-owner", "").items.length, 0);
    assert.equal(listTrash(owner, "recoveryword", "journal").items.length, 1);
    assert.equal(listTrash(owner, "no-match").items.length, 0);
    assert.deepEqual(listTasks(owner), []);
    assert.deepEqual(listBookmarks(owner), []);
    assert.equal(listArtifactPage(owner, { limit: 60 }).items.length, 0);
    assert.deepEqual(searchWorkspace(owner, "recoveryword"), []);
    assert.equal(workspaceOverview(owner, "2026-10-06").counts.open, 0);
    assert.throws(() => getArtifact(owner, ids.artifact));
    assert.throws(() =>
      updateTask(owner, ids.task, { revision: 2, completed: true }),
    );
    assert.deepEqual(Buffer.from(await storage.read(key)), bytes);
    assert.throws(() =>
      restoreTrash("different-owner", "artifact", ids.artifact, 2),
    );
    assert.throws(() => restoreTrash(owner, "artifact", ids.artifact, 1));
    for (const item of listTrash(owner, "").items)
      restoreTrash(owner, item.kind, item.id, item.revision);
    assert.equal(listTrash(owner, "").items.length, 0);
    assert.equal(listTasks(owner).length, 1);
    assert.equal(listBookmarks(owner).length, 1);
    assert.equal(getArtifact(owner, ids.artifact).content, "extracted text");
    assert.equal(searchWorkspace(owner, "recoveryword").length, 5);
    assert.equal(listTasks(owner)[0].recurrence, "daily");
    const before = listTasks(owner)[0];
    moveToTrash(owner, "task", ids.task, before.revision);
    moveToTrash(owner, "artifact", ids.artifact, 3);
    await assert.rejects(deleteTrash(owner, "artifact", ids.artifact, 3));
    assert.deepEqual(Buffer.from(await storage.read(key)), bytes);
    const following = randomUUID();
    db.prepare(
      "INSERT INTO tasks(id,owner_id,title,parent_task_id,due_date,created_at,updated_at) VALUES(?,?,'Following occurrence',?,'2026-10-07',1,1)",
    ).run(following, owner, ids.task);
    for (const item of listTrash(owner, "").items)
      await deleteTrash(owner, item.kind, item.id, item.revision);
    const followingTask = listTasks(owner).find(
      (task) => task.id === following,
    )!;
    assert.equal(followingTask.title, "Following occurrence");
    assert.equal(followingTask.parentTaskId, null);
    assert.equal(followingTask.revision, 2);
    assert.equal(
      db.prepare("SELECT 1 FROM artifacts WHERE id=?").get(ids.artifact),
      undefined,
    );
    await assert.rejects(storage.read(key));
    for (const method of ["GET", "POST", "DELETE"]) {
      const route =
        method === "GET"
          ? "trash"
          : `trash/bookmark/${ids.bookmark}${method === "POST" ? "/restore" : ""}`;
      const response = await routes.GET(
        new Request(`http://localhost:3000/api/v1/${route}`, {
          method,
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          ...(method === "GET"
            ? {}
            : { body: JSON.stringify({ revision: 1 }) }),
        }),
        { params: Promise.resolve({ path: route.split("/") }) },
      );
      assert.equal(response.status, 401);
    }
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    await stopJobWorker();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
