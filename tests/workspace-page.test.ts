import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

test("workspace routes protect private targets and fresh public errors never initialize the instance", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-pages-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { workspacePageState } =
    await import("../src/lib/server/workspace-page");
  const { GET: share } = await import("../src/app/share/[token]/route");
  const token = "a".repeat(48);
  let cookie = "";
  const request = (route: string, authenticated = true) =>
    new Request(`http://localhost:3000${route}`, {
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        ...(authenticated ? { cookie } : {}),
      },
    });
  const shared = (value = token) =>
    share(request(`/share/${value}`, false), {
      params: Promise.resolve({ token: value }),
    });
  try {
    assert.equal(
      await workspacePageState(request("/notes"), { note: randomUUID() }),
      "missing",
    );
    const fresh = await shared();
    assert.equal(fresh.status, 404);
    assert.match(fresh.headers.get("content-type")!, /text\/html/);
    assert.match(await fresh.text(), /Shared page unavailable/);
    assert.deepEqual(await readdir(directory), []);
    const { handleWorkspace } = await import("../src/lib/server/workspace-api");
    const setup = await handleWorkspace(
      new Request("http://localhost:3000/api/nivra/setup", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Page Owner",
          username: "pageowner",
          password: `Secret-${randomUUID()}`,
          encrypted: false,
        }),
      }),
      { params: Promise.resolve({ path: ["setup"] }) },
    );
    assert.equal(setup.status, 200);
    cookie = setup.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    assert.ok(cookie);
    const { sqlite } = await import("../src/lib/server/db");
    const database = sqlite();
    const owner = (
      database.prepare("SELECT id FROM user").get() as { id: string }
    ).id;
    const { createNote } = await import("../src/lib/server/notes");
    const { createBoard } = await import("../src/lib/server/boards");
    const note = createNote(owner, "Private title");
    const board = createBoard(owner, "Project");
    assert.equal(
      await workspacePageState(request("/notes", false), { note: note.id }),
      "login",
    );
    assert.equal(
      await workspacePageState(request("/notes", false), {
        note: randomUUID(),
      }),
      "login",
    );
    assert.equal(
      await workspacePageState(request("/unknown", false)),
      "missing",
    );
    assert.equal(
      await workspacePageState(request("/notes"), { note: note.id }),
      "ready",
    );
    assert.equal(
      await workspacePageState(request("/notes"), { note: randomUUID() }),
      "missing",
    );
    assert.equal(
      await workspacePageState(request("/notes"), { note: [note.id, note.id] }),
      "missing",
    );
    assert.equal(
      await workspacePageState(request("/notes"), { note: "' OR 1=1 --" }),
      "missing",
    );
    database.prepare("UPDATE notes SET trashed_at=1 WHERE id=?").run(note.id);
    assert.equal(
      await workspacePageState(request("/notes"), { note: note.id }),
      "missing",
    );
    for (const route of [
      "/overview",
      "/journal",
      "/favorites",
      "/tasks",
      "/calendar",
      "/bookmarks",
      "/artifacts",
      "/trash",
      "/search",
      "/settings",
    ])
      assert.equal(await workspacePageState(request(route)), "ready", route);
    assert.equal(
      await workspacePageState(request("/tasks"), { board: board.id }),
      "ready",
    );
    assert.equal(
      await workspacePageState(request("/tasks"), { board: "missing" }),
      "missing",
    );
    assert.equal(
      await workspacePageState(request("/tasks"), { task: "missing" }),
      "missing",
    );
    assert.equal(
      await workspacePageState(request("/calendar"), { event: "missing" }),
      "missing",
    );
    assert.equal(
      await workspacePageState(request("/artifacts"), { tag: "missing" }),
      "missing",
    );
    database
      .prepare(
        "INSERT INTO publications(token,note_id,title,document,excerpt,revision,published_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        token,
        note.id,
        "Private title",
        JSON.stringify(note.document),
        "",
        1,
        Date.now(),
      );
    const pending = await shared();
    assert.equal(pending.status, 503);
    assert.equal(pending.headers.get("retry-after"), "60");
    const pendingHtml = await pending.text();
    assert.match(pendingHtml, /temporarily unavailable/);
    assert.doesNotMatch(pendingHtml, /Private title|Page Owner/);
    database.prepare("DELETE FROM publications WHERE token=?").run(token);
    const revoked = await shared();
    assert.equal(revoked.status, 404);
    assert.match(await revoked.text(), /unpublished or deleted/);
    assert.match(revoked.headers.get("cache-control")!, /no-store/);
    assert.match(
      revoked.headers.get("content-security-policy")!,
      /frame-ancestors 'none'/,
    );
    assert.equal((await shared("<script>alert(1)</script>")).status, 404);
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
