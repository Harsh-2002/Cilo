import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";

const [root, base, group, label = "stability", seconds = "1800"] =
  process.argv.slice(2);
assert.ok(root?.startsWith("/"));
assert.ok(group?.startsWith("/sys/fs/cgroup/"));
assert.match(label, /^[a-z0-9-]+$/i);
const duration = Number(seconds);
assert.ok(Number.isInteger(duration) && duration >= 300 && duration <= 86400);
const origin = new URL(base);
assert.ok(
  origin.protocol === "https:" ||
    (origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname)),
);
assert.ok(!origin.username && !origin.password);
mkdirSync(root, { recursive: true, mode: 0o700 });
const session = JSON.parse(readFileSync(root + "/session.json"));
const cookie = encodeURIComponent(session.cookies[0].value);
const headers = {
  Cookie: `better-auth.session_token=${cookie}; __Secure-better-auth.session_token=${cookie}`,
};
const endpoints = [
  `/overview?date=${new Date().toISOString().slice(0, 10)}`,
  "/notes?view=all&preview=1&limit=60",
  "/notes?view=journal&preview=1&limit=60",
  "/favorites?limit=60",
  "/tasks?filter=open&limit=60",
  "/bookmarks?limit=60",
  "/artifacts?limit=60",
  "/trash",
  "/search?q=scaleprobe0999",
  "/search?q=scale",
  "/search?q=type%3Anote%20tag%3A%22Scale%20Work%22%20scale",
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samples = [],
  latency = {},
  phaseLatency = {},
  failures = [];
let stage = "warmup",
  previous;
const started = performance.now();
const stats = (file) =>
  Object.fromEntries(
    readFileSync(group + "/" + file, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split(/\s+/)),
  );
function sample() {
  const now = performance.now(),
    cpu = Number(stats("cpu.stat").usage_usec),
    memory = stats("memory.stat");
  let rss = 0;
  for (const pid of readFileSync(group + "/cgroup.procs", "utf8")
    .trim()
    .split(/\s+/)) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      rss += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
    } catch {}
  }
  if (previous)
    samples.push({
      elapsed: (now - started) / 1000,
      stage,
      corePercent: (cpu - previous.cpu) / (now - previous.now) / 10,
      memory: Number(readFileSync(group + "/memory.current", "utf8")),
      anonymous: Number(memory.anon),
      filesystemCache: Number(memory.file),
      rss,
    });
  previous = { now, cpu };
}
async function measure(endpoint) {
  const before = performance.now();
  const response = await fetch(base + "/api/v1" + endpoint, {
    headers,
    signal: AbortSignal.timeout(60000),
  });
  await response.arrayBuffer();
  if (response.status !== 200) {
    failures.push({
      endpoint: endpoint.split("?")[0],
      status: response.status,
    });
    throw Error("Authorized audit request failed");
  }
  const elapsed = performance.now() - before;
  (latency[endpoint] ||= []).push(elapsed);
  ((phaseLatency[stage] ||= {})[endpoint] ||= []).push(elapsed);
}
const abort = new AbortController();
let timer, drain;
const report = () => {
  const resources = Object.fromEntries(
    [...new Set(samples.map((row) => row.stage))].map((phase) => {
      const rows = samples.filter((row) => row.stage === phase);
      return [
        phase,
        {
          samples: rows.length,
          averageCorePercent:
            rows.reduce((n, row) => n + row.corePercent, 0) / rows.length,
          peakCorePercent: Math.max(...rows.map((row) => row.corePercent)),
          peakMemoryBytes: Math.max(...rows.map((row) => row.memory)),
          peakRssBytes: Math.max(...rows.map((row) => row.rss)),
          peakAnonymousBytes: Math.max(...rows.map((row) => row.anonymous)),
        },
      ];
    }),
  );
  const timings = Object.fromEntries(
    Object.entries(latency).map(([endpoint, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        endpoint,
        {
          requests: values.length,
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[
            Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
          ],
          max: sorted.at(-1),
        },
      ];
    }),
  );
  const browsing = samples.filter((row) => row.stage === "browsing"),
    half = Math.floor(browsing.length / 2);
  const mean = (rows) =>
    rows.reduce((n, row) => n + row.rss, 0) / Math.max(1, rows.length);
  writeFileSync(
    root + "/" + label + ".json",
    JSON.stringify(
      {
        durationSeconds: (performance.now() - started) / 1000,
        cores: availableParallelism(),
        timings,
        phaseTimings: Object.fromEntries(
          Object.entries(phaseLatency).map(([phase, endpoints]) => [
            phase,
            Object.fromEntries(
              Object.entries(endpoints).map(([endpoint, values]) => {
                const sorted = [...values].sort((a, b) => a - b);
                return [
                  endpoint,
                  {
                    requests: sorted.length,
                    p50: sorted[Math.floor(sorted.length * 0.5)],
                    p95: sorted[
                      Math.min(
                        sorted.length - 1,
                        Math.floor(sorted.length * 0.95),
                      )
                    ],
                  },
                ];
              }),
            ),
          ]),
        ),
        resources,
        failures,
        browsingRssFirstHalf: mean(browsing.slice(0, half)),
        browsingRssSecondHalf: mean(browsing.slice(half)),
        samples,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
};
try {
  for (const endpoint of endpoints) await measure(endpoint);
  const sse = await fetch(base + "/api/v1/completions", {
    headers,
    signal: abort.signal,
  });
  assert.equal(sse.status, 200);
  const reader = sse.body.getReader();
  drain = (async () => {
    try {
      while (!(await reader.read()).done) {}
    } catch {}
  })();
  timer = setInterval(() => {
    sample();
    report();
  }, 1000);
  sample();
  await sleep(30000);
  stage = "idle-before";
  await sleep((duration * 1000) / 6);
  stage = "browsing";
  const deadline = performance.now() + duration * 1000 * 0.6;
  while (performance.now() < deadline) {
    for (const endpoint of endpoints) await measure(endpoint);
    await sleep(4000);
  }
  for (const concurrency of [1, 2, 4, 8]) {
    stage = "burst-" + concurrency;
    let index = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (index < 80) {
          const next = index++;
          await measure(endpoints[next % endpoints.length]);
        }
      }),
    );
  }
  stage = "idle-after";
  await sleep(Math.max(60000, started + duration * 1000 - performance.now()));
  sample();
  report();
  console.log(
    "Sustained audit completed; private resource and latency report written.",
  );
} catch (error) {
  report();
  console.error("Sustained audit failed: " + error.name);
  process.exitCode = 1;
} finally {
  abort.abort();
  await drain;
  clearInterval(timer);
}
