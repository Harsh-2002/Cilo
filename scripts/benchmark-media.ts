import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const [mode, directory, id, scenario] = process.argv.slice(2);
const mib = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

async function prepare(size: number) {
  process.env.NIVRA_DATA_DIR = directory;
  const { masterKey, seal } = await import("../src/lib/server/encryption");
  const { createStorage } = await import("../src/lib/server/storage");
  const key = masterKey(directory);
  const bytes = randomBytes(size * 1048576);
  mkdirSync(path.join(directory, "uploads"), { recursive: true });
  writeFileSync(
    path.join(directory, "uploads", `${id}`),
    seal(bytes, key, `object:${id}`),
  );
  const chunkedId = randomUUID();
  await createStorage({ NIVRA_DATA_DIR: directory }).write(chunkedId, bytes);
  console.log(JSON.stringify({ chunkedId }));
}

async function measure() {
  process.env.NIVRA_DATA_DIR = directory;
  const { masterKey, unseal } = await import("../src/lib/server/encryption");
  const { createStorage } = await import("../src/lib/server/storage");
  const { fileResponse, memorySource } =
    await import("../src/lib/server/file-response");
  const key = masterKey(directory);
  const store = createStorage({ NIVRA_DATA_DIR: directory });
  const file = path.join(directory, "uploads", id);
  const request = (range?: string) =>
    new Request(
      "http://nivra.test/file",
      range ? { headers: { Range: range } } : {},
    );
  const meta = { name: "movie.mp4", mime: "video/mp4" };
  const drain = async (response: Response) => {
    let total = 0;
    const reader = response.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
    }
    return total;
  };
  const operations: Record<string, () => Promise<number>> = {
    "legacy range (decrypt whole object)": async () => {
      const response = await fileResponse(
        request("bytes=10000000-11048575"),
        memorySource(unseal(readFileSync(file), key, `object:${id}`)),
        meta,
      );
      return drain(response);
    },
    "chunked range (1 MiB)": async () =>
      drain(
        await fileResponse(
          request("bytes=10000000-11048575"),
          await store.open(scenarioId),
          meta,
        ),
      ),
    "legacy full response": async () =>
      drain(
        await fileResponse(
          request(),
          memorySource(unseal(readFileSync(file), key, `object:${id}`)),
          meta,
        ),
      ),
    "chunked full response (streamed)": async () =>
      drain(await fileResponse(request(), await store.open(scenarioId), meta)),
  };
  const scenarioId = process.argv[7];
  const before = process.resourceUsage().maxRSS * 1024;
  const times: number[] = [];
  let bytes = 0;
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    bytes = await operations[scenario]();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      scenario,
      bytes,
      medianMs: Math.round(times[2]),
      peakRssGrowthMiB: mib(process.resourceUsage().maxRSS * 1024 - before),
    }),
  );
}

async function main() {
  if (mode === "prepare") return prepare(Number(process.argv[6]));
  if (mode === "measure") return measure();
  const run = (...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", process.argv[1], ...args],
      { encoding: "utf8" },
    );
    if (result.status) throw new Error(result.stderr);
    return JSON.parse(result.stdout.trim().split("\n").pop()!);
  };
  const rows: Record<string, unknown>[] = [];
  for (const size of [25, 100]) {
    const root = mkdtempSync(path.join(tmpdir(), "nivra-media-benchmark-"));
    const legacyId = randomUUID();
    try {
      const { chunkedId } = run("prepare", root, legacyId, "", String(size));
      for (const scenario of [
        "legacy range (decrypt whole object)",
        "chunked range (1 MiB)",
        "legacy full response",
        "chunked full response (streamed)",
      ])
        rows.push({
          sizeMiB: size,
          ...run("measure", root, legacyId, scenario, String(size), chunkedId),
        });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify(rows, null, 2));
}
void main();
