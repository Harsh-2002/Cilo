import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function main() {
  const directory = mkdtempSync(path.join(tmpdir(), "cilo-library-benchmark-"));
  process.env.CILO_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const { listNotes, getNote } = await import("../src/lib/server/notes");
  const { listTasks } = await import("../src/lib/server/tasks");
  const { listBookmarks } = await import("../src/lib/server/bookmarks");
  const { searchWorkspace } = await import("../src/lib/server/unified-search");
  const { workspaceOverview } = await import("../src/lib/server/overview");
  const database = sqlite();
  try {
    const owner = randomUUID();
    database
      .prepare(
        "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        owner,
        "Benchmark Owner",
        "benchmark@example.invalid",
        "benchmark",
        1,
        1,
      );
    const note = database.prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    );
    const task = database.prepare(
      "INSERT INTO tasks(id,owner_id,title,note_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    );
    const bookmark = database.prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,description,note_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    );
    let target = "";
    database.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        const id = randomUUID();
        if (i === 9999) target = id;
        const text = `${"A synthetic paragraph about steady work and useful ideas. ".repeat(30)} Library reference nebula ${i.toString(36)} ${randomUUID()}`;
        const document = {
          schemaVersion: 1,
          blocks: [
            {
              id: randomUUID(),
              type: "paragraph",
              content: [{ type: "text", text, styles: {} }],
            },
          ],
        };
        note.run(
          id,
          owner,
          `Research note ${i}`,
          JSON.stringify(document),
          text,
          i,
          i,
        );
        if (i < 5000) {
          task.run(
            randomUUID(),
            owner,
            `Review nebula task ${i} ${randomUUID()}`,
            id,
            i,
            i,
          );
          bookmark.run(
            randomUUID(),
            owner,
            `https://example.invalid/${i}`,
            `Nebula reference ${i}`,
            `Useful library resource ${randomUUID()}`,
            id,
            i,
            i,
          );
        }
      }
    })();
    const measure = (name: string, operation: () => unknown) => {
      const times: number[] = [];
      let output: unknown;
      for (let i = 0; i < 12; i++) {
        const start = performance.now();
        output = operation();
        times.push(performance.now() - start);
      }
      const ordered = times.slice(2).sort((a, b) => a - b);
      return {
        name,
        coldMs: +times[0].toFixed(2),
        medianMs: +ordered[Math.floor(ordered.length / 2)].toFixed(2),
        p95Ms: +ordered.at(-1)!.toFixed(2),
        bytes: Buffer.byteLength(JSON.stringify(output)),
        rows: Array.isArray(output) ? output.length : undefined,
      };
    };
    console.log(
      JSON.stringify(
        {
          fixtures: { notes: 10000, tasks: 5000, bookmarks: 5000 },
          results: [
            measure("note-list", () =>
              listNotes(new URLSearchParams({ view: "all" })),
            ),
            measure("note-page", () =>
              listNotes(
                new URLSearchParams({ view: "all", limit: "60", preview: "1" }),
              ),
            ),
            measure("open-note", () => getNote(target)),
            measure("tasks", () => listTasks(owner)),
            measure("bookmarks", () => listBookmarks(owner)),
            measure("overview", () => workspaceOverview(owner, "2026-10-05")),
            measure("search-common", () => searchWorkspace(owner, "nebula")),
            measure("search-typo", () => searchWorkspace(owner, "neubla")),
            measure("search-missing", () =>
              searchWorkspace(owner, "unfindablexyz"),
            ),
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
void main();
