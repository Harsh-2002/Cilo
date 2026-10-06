import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const [action, requestedRoot, mode, operation, requestedSize] =
  process.argv.slice(2);
assert.ok(
  requestedRoot && path.isAbsolute(requestedRoot),
  "Provide a new absolute benchmark directory.",
);
const root = path.resolve(requestedRoot);
const owner = "00000000-0000-4000-8000-000000000001";
const fixture = "00000000-0000-4000-8000-000000000002";
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

async function child() {
  assert.ok(mode === "true" || mode === "false");
  process.env.NIVRA_DATA_DIR = path.join(root, mode);
  process.env.NIVRA_ENCRYPTION_ENABLED = mode;
  const { sqlite } = await import("../src/lib/server/db");
  const { createStorage } = await import("../src/lib/server/storage");
  const size = Number(requestedSize || 25) * 1024 * 1024;
  const store = createStorage({
    NIVRA_DATA_DIR: path.join(root, `${mode}-files-${size}`),
    NIVRA_ENCRYPTION_ENABLED: mode,
  });
  if (action === "prepare") {
    const db = sqlite();
    db.prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).run(owner, "Synthetic owner", "benchmark@local.invalid", "benchmark");
    const note = db.prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,daily_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    );
    const task = db.prepare(
      "INSERT INTO tasks(id,owner_id,title,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    );
    const link = db.prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,description,collection,metadata_status,created_at,updated_at) VALUES(?,?,?,?,?,?,'ready',?,?)",
    );
    const artifact = db.prepare(
      "INSERT INTO artifacts(id,owner_id,kind,title,content,extraction,created_at,updated_at) VALUES(?,?,'text',?,?,'done',?,?)",
    );
    const id = (type: number, index: number) =>
      `${String(type).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
    db.transaction(() => {
      for (let i = 1; i <= 5000; i++) {
        const label = String(i).padStart(4, "0");
        const text =
          `benchmarktoken${label} sharedmatch. ` +
          "Synthetic searchable content. ".repeat(i % 100 ? 20 : 2000);
        const doc = JSON.stringify({
          schemaVersion: 1,
          blocks: [
            {
              type: "paragraph",
              content: [{ type: "text", text, styles: {} }],
            },
          ],
        });
        note.run(
          id(1, i),
          owner,
          `Benchmark note ${label}`,
          doc,
          text,
          null,
          i,
          i,
        );
        note.run(
          id(2, i),
          owner,
          `Benchmark journal ${label}`,
          doc,
          text,
          new Date(Date.UTC(2080, 0, i)).toISOString().slice(0, 10),
          i,
          i,
        );
        task.run(
          id(3, i),
          owner,
          `Benchmark task ${label}`,
          i % 3 ? null : "2026-10-10",
          i,
          i,
        );
        link.run(
          id(4, i),
          owner,
          `https://example.com/benchmark/${label}`,
          `Benchmark link ${label}`,
          text.slice(0, 600),
          "Benchmark",
          i,
          i,
        );
        artifact.run(
          id(5, i),
          owner,
          `Benchmark artifact ${label}`,
          text,
          i,
          i,
        );
      }
    }).immediate();
    db.pragma("wal_checkpoint(TRUNCATE)");
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    db.close();
    for (const mib of [25, 100]) {
      const fileStore = createStorage({
        NIVRA_DATA_DIR: path.join(root, `${mode}-files-${mib * 1024 * 1024}`),
        NIVRA_ENCRYPTION_ENABLED: mode,
      });
      await fileStore.write(fixture, Buffer.alloc(mib * 1024 * 1024, 97));
    }
    console.log(JSON.stringify({ prepared: true }));
    return;
  }
  if (action === "database") {
    const { listNotes } = await import("../src/lib/server/notes");
    const { listTaskPage } = await import("../src/lib/server/tasks");
    const { listBookmarkPage } = await import("../src/lib/server/bookmarks");
    const { listArtifactPage } = await import("../src/lib/server/artifacts");
    const { workspaceOverview } = await import("../src/lib/server/overview");
    const { searchWorkspace } =
      await import("../src/lib/server/unified-search");
    const db = sqlite();
    const cases: [string, () => unknown][] = [
      [
        "notes",
        () =>
          listNotes(
            new URLSearchParams({ view: "all", preview: "1", limit: "30" }),
          ),
      ],
      [
        "journals",
        () =>
          listNotes(
            new URLSearchParams({ view: "journal", preview: "1", limit: "30" }),
          ),
      ],
      [
        "tasks",
        () =>
          listTaskPage(owner, {
            filter: "open",
            query: "",
            today: "2026-10-06",
            limit: 30,
          }),
      ],
      ["bookmarks", () => listBookmarkPage(owner, { limit: 30 })],
      [
        "artifacts",
        () => listArtifactPage(owner, { limit: 30, context: false }),
      ],
      ["overview", () => workspaceOverview(owner, "2026-10-06")],
      [
        "artifact-search",
        () =>
          listArtifactPage(owner, {
            query: "sharedmatch",
            limit: 30,
            context: false,
          }),
      ],
      ["unified-search", () => searchWorkspace(owner, "benchmarktoken0100")],
      [
        "update-100-tasks",
        () =>
          db
            .transaction(() => {
              const update = db.prepare(
                "UPDATE tasks SET title=title || 'x',revision=revision+1 WHERE id=?",
              );
              for (let i = 1; i <= 100; i++)
                update.run(
                  `00000003-0000-4000-8000-${String(i).padStart(12, "0")}`,
                );
            })
            .immediate(),
      ],
    ];
    const measurements = cases.map(([name, call]) => {
      const firstStart = performance.now();
      call();
      const firstMs = performance.now() - firstStart;
      const cpu = process.cpuUsage();
      const times: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        call();
        times.push(performance.now() - start);
      }
      const used = process.cpuUsage(cpu);
      return {
        name,
        firstMs,
        medianMs: median(times),
        p95Ms: p95(times),
        cpuMs: (used.user + used.system) / 1000,
      };
    });
    const dbBytes = statSync(
      path.join(process.env.NIVRA_DATA_DIR, "nivra.sqlite"),
    ).size;
    db.close();
    console.log(
      JSON.stringify({
        mode,
        measurements,
        dbBytes,
        peakRssMiB: process.resourceUsage().maxRSS / 1024,
      }),
    );
    return;
  }
  assert.equal(action, "file");
  const input = operation === "write" ? Buffer.alloc(size, 97) : undefined;
  const baselineRss = process.memoryUsage().rss;
  const cpu = process.cpuUsage(),
    start = performance.now();
  if (input) await store.write(randomUUID(), input);
  else {
    const bytes = await store.read(fixture);
    assert.equal(bytes.length, size);
    assert.equal(bytes[bytes.length - 1], 97);
  }
  const elapsedMs = performance.now() - start,
    used = process.cpuUsage(cpu);
  console.log(
    JSON.stringify({
      mode,
      operation,
      sizeMiB: size / 1048576,
      elapsedMs,
      cpuMs: (used.user + used.system) / 1000,
      baselineRssMiB: baselineRss / 1048576,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
    }),
  );
}
async function main() {
  if (action !== "run") return child();
  assert.ok(
    !existsSync(root),
    "The benchmark requires a new directory and never modifies an existing instance.",
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const execute = async (args: string[]) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "tsx",
        path.resolve("scripts/benchmark-encryption.ts"),
        ...args,
      ],
      {
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          NIVRA_ENCRYPTION_KEY: "",
          NIVRA_ENCRYPTION_KEY_FILE: "",
          NODE_OPTIONS: "--max-old-space-size=1536",
        },
      },
    );
    return JSON.parse(stdout.trim());
  };
  const result = {
    date: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    database: [] as unknown[],
    files: [] as unknown[],
  };
  for (const mode of ["false", "true"]) await execute(["prepare", root, mode]);
  for (let repetition = 0; repetition < 3; repetition++)
    for (const mode of repetition % 2 ? ["true", "false"] : ["false", "true"])
      result.database.push(await execute(["database", root, mode]));
  for (const size of ["25", "100"])
    for (const operation of ["read", "write"])
      for (let repetition = 0; repetition < 3; repetition++)
        for (const mode of repetition % 2
          ? ["true", "false"]
          : ["false", "true"])
          result.files.push(
            await execute(["file", root, mode, operation, size]),
          );
  writeFileSync(
    path.join(root, "results.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    "Encryption benchmark complete; synthetic data and results retained in the requested private directory.",
  );
}
main().catch((error: unknown) => {
  console.error(
    "Encryption benchmark failed. Inspect the disposable benchmark directory; existing installations are unchanged.",
  );
  console.error(
    error instanceof Error ? error.message : "Unknown benchmark error",
  );
  process.exitCode = 1;
});
