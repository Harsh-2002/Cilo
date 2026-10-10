import {
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

async function main() {
  const requestedRoot = process.argv[2];
  assert.ok(
    requestedRoot && path.isAbsolute(requestedRoot),
    "Provide a new absolute output directory outside the repository.",
  );
  const root = path.resolve(requestedRoot);
  assert.ok(
    root !== process.cwd() && !root.startsWith(process.cwd() + path.sep),
  );
  assert.ok(!existsSync(root), "The benchmark directory must not exist.");
  const size = Number(process.argv[3] || 100000);
  assert.ok(Number.isSafeInteger(size) && size >= 1000 && size <= 300000);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = path.join(root, "data");
  const out = path.join(root, "results.json");
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { listNotes } = await import("../src/lib/server/notes");
  const { listTaskPage, taskCounts } = await import("../src/lib/server/tasks");
  const { listBookmarkPage, bookmarkSummary } =
    await import("../src/lib/server/bookmarks");
  const { listArtifactPage, artifactSummary } =
    await import("../src/lib/server/artifacts");
  const { searchWorkspace } = await import("../src/lib/server/unified-search");
  const { agentSearch } = await import("../src/lib/server/agent-search");
  const { agentCounts } = await import("../src/lib/server/agent-counts");
  const { workspaceOverview } = await import("../src/lib/server/overview");
  const { calendarRange } = await import("../src/lib/server/calendar");
  const { favoriteItems, taggedItems } =
    await import("../src/lib/server/item-tags");
  const { getBoard } = await import("../src/lib/server/boards");
  const { listTrash } = await import("../src/lib/server/trash");
  const { listForms } = await import("../src/lib/server/forms");
  const { listFormResponses } = await import("../src/lib/server/form-results");
  const d = sqlite();
  assert.equal(
    JSON.parse(
      readFileSync(path.join(directory, "encryption-mode.json"), "utf8"),
    ).encrypted,
    true,
  );
  const owner = randomUUID(),
    board = randomUUID(),
    formIds: string[] = [];
  const clock = Date.UTC(2026, 9, 10, 12),
    day = 86400000;
  const counts = {
    notes: 0,
    journals: 0,
    tasks: 0,
    bookmarks: 0,
    artifacts: 0,
    forms: 0,
    events: 0,
    responses: 0,
    tags: 16,
  };
  try {
    d.prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    ).run(
      owner,
      "Synthetic Audit",
      "sql-audit@example.invalid",
      "sql-audit",
      1,
      1,
    );
    d.prepare(
      "INSERT INTO task_boards(id,owner_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
    ).run(board, owner, "Audit board", 1, 1);
    for (let i = 0; i < 16; i++)
      d.prepare("INSERT INTO tags(id,name,color) VALUES(?,?,?)").run(
        `tag-${i}`,
        `Topic ${i}`,
        "gray",
      );
    const note = d.prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,daily_date,favorite,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    );
    const task = d.prepare(
      "INSERT INTO tasks(id,owner_id,title,board_id,board_position,open_stage,due_date,planned_date,completed_at,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    const bookmark = d.prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,description,collection,favorite,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    );
    const artifact = d.prepare(
      "INSERT INTO artifacts(id,owner_id,kind,title,content,name,mime,size,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    );
    const form = d.prepare(
      "INSERT INTO forms(id,owner_id,title,description,definition,favorite,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    const event = d.prepare(
      "INSERT INTO calendar_events(id,owner_id,title,description,start_date,end_date,recurring,data,trashed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?,?,?)",
    );
    const tags = Object.fromEntries(
      ["note", "task", "bookmark", "artifact", "event", "form"].map((type) => [
        type,
        d.prepare(`INSERT INTO ${type}_tags(${type}_id,tag_id) VALUES(?,?)`),
      ]),
    );
    const date = (at: number) => new Date(at).toISOString().slice(0, 10);
    const definition = JSON.stringify({
      schemaVersion: 1,
      title: "Synthetic form",
      description: "",
      confirmation: "Received.",
      fields: [],
    });
    const started = performance.now();
    console.log(JSON.stringify({ stage: "seeding", size, directory }));
    d.transaction(() => {
      for (let i = 0; i < size; i++) {
        const slot = i % 100,
          id = randomUUID();
        const hash = createHash("sha256").update(String(i)).digest("hex");
        const tokens = ` ${hash.slice(0, 8)} ${hash.slice(8, 20)}${i % 17 === 0 ? " nebula" : ""}${i % 20 === 0 ? " batchmarker" : ""}${i < 100 ? " needlealpha" : ""}`;
        const title = `Research reference ${i}${tokens}`;
        const text = `${"A synthetic paragraph describing useful plans and collected information. ".repeat(18)} ${tokens}`;
        const at = clock - (i % 730) * day - (i % 500) * 60000,
          trashed = i % 23 === 0 ? clock - i : null,
          favorite = i % 7 === 0 ? 1 : 0;
        let type: string;
        if (slot < 40) {
          type = "note";
          const journal = slot >= 20;
          if (journal) counts.journals++;
          else counts.notes++;
          const document = JSON.stringify({
            schemaVersion: 1,
            blocks: [
              {
                id: randomUUID(),
                type: "paragraph",
                content: [{ type: "text", text, styles: {} }],
              },
            ],
          });
          note.run(
            id,
            owner,
            title,
            document,
            text,
            journal ? date(clock - counts.journals * day) : null,
            favorite,
            trashed,
            at,
            at,
          );
        } else if (slot < 60) {
          type = "task";
          counts.tasks++;
          task.run(
            id,
            owner,
            title,
            i % 3 ? board : null,
            i * 1024,
            i % 3 === 1 ? "in_progress" : "todo",
            i % 9 === 0 ? date(at) : null,
            i % 11 === 0 ? date(at) : null,
            i % 4 === 0 ? at + 3600000 : null,
            trashed,
            at,
            at,
          );
        } else if (slot < 80) {
          type = "bookmark";
          counts.bookmarks++;
          bookmark.run(
            id,
            owner,
            `https://example.invalid/audit/${i}`,
            title,
            text,
            `Collection ${i % 8}`,
            favorite,
            trashed,
            at,
            at,
          );
        } else if (slot < 98) {
          type = "artifact";
          counts.artifacts++;
          artifact.run(
            id,
            owner,
            "text",
            title,
            text,
            `Reference ${i}.txt`,
            "text/plain",
            text.length,
            trashed,
            at,
            at,
          );
        } else if (slot === 98) {
          type = "form";
          counts.forms++;
          formIds.push(id);
          form.run(
            id,
            owner,
            title,
            text,
            definition,
            favorite,
            trashed,
            at,
            at,
          );
        } else {
          type = "event";
          counts.events++;
          const start = date(at),
            end = date(at + day);
          const data = JSON.stringify({
            title,
            description: text,
            start,
            end,
            allDay: true,
            timezone: "UTC",
            recurrence: null,
            links: [],
            reminderMinutes: null,
          });
          event.run(id, owner, title, text, start, end, data, trashed, at, at);
        }
        tags[type].run(id, `tag-${i % 16}`);
        if (i % 5 === 0) tags[type].run(id, `tag-${(i + 3) % 16}`);
      }
      const version = d.prepare(
        "INSERT INTO form_versions(id,form_id,revision,definition,created_at) VALUES(?,?,1,?,?)",
      );
      const response = d.prepare(
        "INSERT INTO form_responses(id,form_id,version_id,answers,search_text,retry_key,request_hash,created_at) VALUES(?,?,?,?,?,?,?,?)",
      );
      for (const f of formIds.slice(0, 20)) {
        const v = randomUUID();
        version.run(v, f, definition, clock);
        for (let i = 0; i < 1000; i++) {
          response.run(
            randomUUID(),
            f,
            v,
            "{}",
            `Submission research ${i}`,
            randomUUID(),
            "synthetic",
            clock - (i % 730) * day,
          );
          counts.responses++;
        }
      }
    }).immediate();
    d.pragma("wal_checkpoint(TRUNCATE)");
    const seedMs = performance.now() - started;
    console.log(JSON.stringify({ stage: "seeded", counts, seedMs }));
    const operations: [string, () => unknown][] = [
      [
        "notes/page",
        () =>
          listNotes(
            new URLSearchParams({ view: "all", limit: "60", preview: "1" }),
            undefined,
            owner,
          ),
      ],
      [
        "journals/page",
        () =>
          listNotes(
            new URLSearchParams({ view: "journal", limit: "60", preview: "1" }),
            undefined,
            owner,
          ),
      ],
      [
        "notes/search-broad",
        () =>
          listNotes(
            new URLSearchParams({
              view: "all",
              q: "research",
              limit: "60",
              preview: "1",
            }),
            undefined,
            owner,
          ),
      ],
      [
        "notes/page-offset-10000",
        () =>
          listNotes(
            new URLSearchParams({
              view: "all",
              limit: "60",
              preview: "1",
              offset: "10000",
            }),
            undefined,
            owner,
          ),
      ],
      [
        "tasks/page",
        () => listTaskPage(owner, { filter: "open", query: "", limit: 60 }),
      ],
      [
        "tasks/search-rare",
        () =>
          listTaskPage(owner, {
            filter: "open",
            query: "needlealpha",
            limit: 60,
          }),
      ],
      ["tasks/counts", () => taskCounts(owner)],
      ["boards/counts", () => getBoard(owner, board)],
      [
        "boards/page",
        () =>
          listTaskPage(owner, {
            filter: "open",
            boardId: board,
            status: "todo",
            order: "board",
            query: "",
            limit: 60,
          }),
      ],
      ["bookmarks/page", () => listBookmarkPage(owner, { limit: 60 })],
      [
        "bookmarks/search-rare",
        () => listBookmarkPage(owner, { limit: 60, query: "needlealpha" }),
      ],
      [
        "bookmarks/search-missing",
        () => listBookmarkPage(owner, { limit: 60, query: "zzzzzzzz" }),
      ],
      [
        "bookmarks/search-summary",
        () => bookmarkSummary(owner, { query: "needlealpha" }),
      ],
      [
        "artifacts/page",
        () => listArtifactPage(owner, { limit: 60, context: false }),
      ],
      [
        "artifacts/search-broad",
        () => listArtifactPage(owner, { limit: 60, query: "research" }),
      ],
      ["artifacts/counts", () => artifactSummary(owner)],
      ["overview", () => workspaceOverview(owner, "2026-10-10")],
      ["global/empty", () => searchWorkspace(owner, "")],
      ["global/rare", () => searchWorkspace(owner, "needlealpha")],
      ["global/medium", () => searchWorkspace(owner, "batchmarker")],
      ["global/broad", () => searchWorkspace(owner, "research")],
      ["global/typo", () => searchWorkspace(owner, "neubla")],
      ["global/missing", () => searchWorkspace(owner, "xxxxxxxx")],
      ["link/rare", () => searchWorkspace(owner, "needlealpha", "link")],
      [
        "api/search-rare",
        () =>
          agentSearch(owner, { query: "needlealpha", limit: 60, offset: 0 }),
      ],
      [
        "api/search-broad",
        () => agentSearch(owner, { query: "research", limit: 60, offset: 0 }),
      ],
      [
        "api/search-broad-late",
        () =>
          agentSearch(owner, { query: "research", limit: 60, offset: 10000 }),
      ],
      [
        "api/counts",
        () => agentCounts(owner, { state: "active", favoritesOnly: false }),
      ],
      [
        "api/counts-tag",
        () =>
          agentCounts(owner, {
            state: "active",
            favoritesOnly: false,
            tagId: "tag-1",
          }),
      ],
      [
        "api/counts-favorites",
        () => agentCounts(owner, { state: "active", favoritesOnly: true }),
      ],
      ["favorites/page", () => favoriteItems(owner, "", 60, 0)],
      ["tags/page", () => taggedItems(owner, "tag-1", "", 60, 0)],
      ["tags/page-late", () => taggedItems(owner, "tag-1", "", 60, 2000)],
      ["trash/page", () => listTrash(owner, "")],
      ["forms/page", () => listForms(owner)],
      ["forms/responses", () => listFormResponses(owner, formIds[1])],
      [
        "forms/response-search",
        () =>
          listFormResponses(
            owner,
            formIds[1],
            new URLSearchParams({ q: "research" }),
          ),
      ],
      [
        "calendar/planning",
        () =>
          calendarRange(owner, "2026-10-01", "2026-11-01", "UTC", {
            preview: 3,
          }),
      ],
      [
        "calendar/activity",
        () =>
          calendarRange(owner, "2026-10-01", "2026-11-01", "UTC", {
            mode: "activity",
            preview: 3,
          }),
      ],
      [
        "calendar/tag",
        () =>
          calendarRange(owner, "2026-10-01", "2026-11-01", "UTC", {
            mode: "activity",
            preview: 3,
            tag: "tag-1",
          }),
      ],
    ];
    function measure(name: string, operation: () => unknown) {
      const times: number[] = [];
      let value: unknown;
      const cpuStart = process.cpuUsage();
      for (let i = 0; i < 7; i++) {
        if (name.startsWith("calendar/"))
          d.prepare("UPDATE instance SET theme=theme").run();
        const start = performance.now();
        value = operation();
        times.push(performance.now() - start);
      }
      const warm = times.slice(1).sort((a, b) => a - b),
        cpu = process.cpuUsage(cpuStart);
      return {
        name,
        firstMs: +times[0].toFixed(2),
        p50Ms: +warm[3].toFixed(2),
        maxWarmMs: +warm[5].toFixed(2),
        cpuMs: +((cpu.user + cpu.system) / 1000).toFixed(2),
        bytes: Buffer.byteLength(JSON.stringify(value)),
      };
    }
    type Captured = { sql: string; args: unknown[]; calls: number; ms: number };
    const prepare = d.prepare.bind(d);
    function profile(operation: () => unknown) {
      const captured = new Map<string, Captured>();
      d.prepare = ((sql: string) => {
        const statement = prepare(sql);
        const observe =
          <T>(operation: (...args: unknown[]) => T) =>
          (...args: unknown[]): T => {
            const start = performance.now();
            try {
              return operation(...args);
            } finally {
              const row = captured.get(sql) ?? { sql, args, calls: 0, ms: 0 };
              row.calls++;
              row.ms += performance.now() - start;
              captured.set(sql, row);
            }
          };
        statement.get = observe(statement.get.bind(statement));
        statement.all = observe(statement.all.bind(statement));
        return statement;
      }) as typeof d.prepare;
      const start = performance.now();
      try {
        operation();
      } finally {
        d.prepare = prepare;
      }
      return {
        totalMs: performance.now() - start,
        sqlMs: [...captured.values()].reduce((sum, r) => sum + r.ms, 0),
        calls: [...captured.values()].reduce((sum, r) => sum + r.calls, 0),
        queries: [...captured.values()]
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 6)
          .map((r) => ({
            ...r,
            plan: prepare("EXPLAIN QUERY PLAN " + r.sql).all(...r.args),
          })),
      };
    }
    const measurements = operations.map(([name, op]) => {
      const result = measure(name, op);
      console.log(JSON.stringify({ stage: "measurement", ...result }));
      if (name.startsWith("calendar/"))
        d.prepare("UPDATE instance SET theme=theme").run();
      return { ...result, profile: profile(op) };
    });
    const fuzzyProfile = profile(() => searchWorkspace(owner, "yyyyyyyy"));
    const integrity = d.pragma("quick_check");
    assert.deepEqual(d.pragma("foreign_key_check"), []);
    assert.deepEqual(integrity, [{ quick_check: "ok" }]);
    const report = {
      integrity,
      size,
      counts,
      seedMs,
      sqliteVersion: d.prepare("SELECT sqlite_version() AS version").get(),
      journalMode: d.pragma("journal_mode", { simple: true }),
      encryption: d.pragma("cipher", { simple: true }),
      cpu: cpus()[0]?.model,
      node: process.version,
      dbMiB: +(
        statSync(path.join(directory, "nivra.sqlite")).size / 1048576
      ).toFixed(1),
      measurements,
      fuzzyProfile,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
    };
    writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify({ stage: "complete", out, peakRssMiB: report.peakRssMiB }),
    );
  } finally {
    d.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
