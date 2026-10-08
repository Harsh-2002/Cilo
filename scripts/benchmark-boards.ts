import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function main() {
  const directory = mkdtempSync(path.join(tmpdir(), "nivra-board-benchmark-"));
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_ENCRYPTION_ENABLED = "true";
  const { sqlite } = await import("../src/lib/server/db");
  const { createBoard, getBoard } = await import("../src/lib/server/boards");
  const { listTaskPage, moveTask, getTask } =
    await import("../src/lib/server/tasks");
  const database = sqlite();
  try {
    const owner = randomUUID();
    database
      .prepare(
        "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .run(owner, "Benchmark", "benchmark@example.invalid", "benchmark", 1, 1);
    const board = createBoard(owner, "Synthetic board");
    const insert = database.prepare(
      "INSERT INTO tasks(id,owner_id,title,board_id,open_stage,board_position,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    let target = "";
    database.transaction(() => {
      for (let i = 0; i < 50000; i++) {
        const id = randomUUID();
        if (i === 0) target = id;
        insert.run(
          id,
          owner,
          `Research ${i % 100 === 0 ? "nebula" : "ordinary"} ${i}`,
          board.id,
          i < 40000 ? "todo" : "in_progress",
          i * 1024,
          i >= 48000 ? 1 : null,
          i,
          i,
        );
      }
    })();
    const measure = (name: string, action: () => unknown) => {
      const times: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        action();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return {
        name,
        p50Ms: +times[15].toFixed(2),
        p95Ms: +times[28].toFixed(2),
      };
    };
    const cpu = process.cpuUsage();
    const start = performance.now();
    const results = [
      measure("stage counts", () => getBoard(owner, board.id)),
      measure("first 50 cards", () =>
        listTaskPage(owner, {
          filter: "open",
          query: "",
          limit: 50,
          boardId: board.id,
          status: "todo",
          order: "board",
        }),
      ),
      measure("prefix search", () =>
        listTaskPage(owner, {
          filter: "open",
          query: "research neb",
          limit: 50,
          boardId: board.id,
          status: "todo",
          order: "board",
        }),
      ),
      measure("card move", () => {
        const task = getTask(owner, target);
        moveTask(owner, target, {
          revision: task.revision,
          boardId: board.id,
          status: task.status === "todo" ? "in_progress" : "todo",
        });
      }),
    ];
    const usage = process.cpuUsage(cpu);
    console.log(
      JSON.stringify(
        {
          records: 50000,
          encrypted: true,
          results,
          measuredWallMs: +(performance.now() - start).toFixed(1),
          measuredCpuMs: (usage.user + usage.system) / 1000,
          processPeakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
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
