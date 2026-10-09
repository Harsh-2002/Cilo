import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
process.on("unhandledRejection", (error) => {
  console.error("Single-user audit failed:", error?.name || "Error");
  process.exit(1);
});
const [root, base, group, label = "api"] = process.argv.slice(2);
assert.ok(root?.startsWith("/"));
assert.ok(group?.startsWith("/sys/fs/cgroup/"));
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
const endpoints = {
  overview: "/overview?date=2026-10-07",
  notes: "/notes?view=all&preview=1&limit=60",
  journals: "/notes?view=journal&preview=1&limit=60",
  favorites: "/favorites?limit=60",
  tasks: "/tasks?filter=open&limit=60",
  bookmarks: "/bookmarks?limit=60",
  artifacts: "/artifacts?limit=60",
  trash: "/trash",
  search: "/search?q=scaleprobe0999",
  searchBroad: "/search?q=scale",
  searchTags: "/search?q=type%3Anote%20tag%3A%22Scale%20Work%22%20scale",
  bookmarkFavorites: "/bookmarks?favorite=1&limit=60",
  artifactSearch: "/artifacts?limit=60&q=Scale%20test&context=0",
};
if (existsSync(root + "/fixture-tags.json")) {
  const tags = JSON.parse(readFileSync(root + "/fixture-tags.json"));
  endpoints.taggedItems = `/tags/${tags.tags[0]}/items?limit=60`;
}

let stage = "warmup",
  prior,
  samples = [];
const sample = () => {
  const now = performance.now(),
    cpu = Number(
      readFileSync(group + "/cpu.stat", "utf8").match(/^usage_usec (\d+)$/m)[1],
    );
  if (prior)
    samples.push({
      stage,
      cpu: (cpu - prior.cpu) / (now - prior.now) / 10,
      memory: Number(readFileSync(group + "/memory.current", "utf8")),
    });
  prior = { now, cpu };
};
const timer = setInterval(sample, 1000);
sample();
const abort = new AbortController();
let drain;
const measure = async (url) => {
  const started = performance.now();
  const r = await fetch(base + "/api/v1" + url, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  const b = await r.arrayBuffer();
  assert.equal(r.status, 200);
  return { ms: performance.now() - started, bytes: b.byteLength };
};
try {
  for (const url of Object.values(endpoints)) await measure(url);
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
  stage = "idle-with-sse";
  await new Promise((r) => setTimeout(r, 60000));
  const latency = {};
  stage = "single-user-api";
  for (const [name, url] of Object.entries(endpoints)) {
    const values = [];
    for (let i = 0; i < 20; i++) {
      values.push(await measure(url));
      await new Promise((r) => setTimeout(r, 150));
    }
    const times = values.map((x) => x.ms).sort((a, b) => a - b);
    latency[name] = {
      p50: times[9],
      p95: times[18],
      max: times[19],
      bytes: values[0].bytes,
    };
    console.log(name, JSON.stringify(latency[name]));
  }
  abort.abort();
  await drain;
  stage = "idle-after";
  await new Promise((r) => setTimeout(r, 30000));
  const resource = Object.fromEntries(
    [...new Set(samples.map((x) => x.stage))].map((s) => {
      const rows = samples.filter((x) => x.stage === s);
      return [
        s,
        {
          samples: rows.length,
          averageCorePercent: rows.reduce((n, x) => n + x.cpu, 0) / rows.length,
          peakCorePercent: Math.max(...rows.map((x) => x.cpu)),
          peakMemoryBytes: Math.max(...rows.map((x) => x.memory)),
        },
      ];
    }),
  );
  writeFileSync(
    root + "/" + label + ".json",
    JSON.stringify(
      { cores: availableParallelism(), latency, resource, samples },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(resource));
} finally {
  abort.abort();
  await drain;
  clearInterval(timer);
}
