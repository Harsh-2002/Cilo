import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const [output, group] = process.argv.slice(2);
assert.ok(output && path.isAbsolute(output));
assert.ok(group?.startsWith("/sys/fs/cgroup/"));
const cores = availableParallelism();
const report = {
  intervalMs: 1000,
  cores,
  samples: 0,
  observedPeakMemoryBytes: 0,
  observedPeakProcessRssBytes: 0,
  peakCpuCorePercent: 0,
  peakCpuMachinePercent: 0,
  kernelMemoryPeakAtStart: Number(
    readFileSync(path.join(group, "memory.peak"), "utf8"),
  ),
  stages: {},
};
let prior = null;
while (!existsSync(path.join(output, "stop-monitor"))) {
  const now = performance.now();
  const cpu = Number(
    readFileSync(path.join(group, "cpu.stat"), "utf8").match(
      /^usage_usec (\d+)$/m,
    )[1],
  );
  const memory = Number(
    readFileSync(path.join(group, "memory.current"), "utf8"),
  );
  const cpuPercent = prior
    ? Math.max(0, (cpu - prior.cpu) / (now - prior.now) / 10)
    : 0;
  let rss = 0;
  for (const pid of new Set(
    readFileSync(path.join(group, "cgroup.procs"), "utf8").trim().split(/\s+/),
  )) {
    try {
      rss +=
        Number(
          readFileSync(`/proc/${pid}/status`, "utf8").match(
            /^VmRSS:\s+(\d+) kB$/m,
          )?.[1] || 0,
        ) * 1024;
    } catch {}
  }
  const phase = existsSync(path.join(output, "phase"))
    ? readFileSync(path.join(output, "phase"), "utf8").trim()
    : "audit";
  const stage = (report.stages[phase] ||= {
    samples: 0,
    peakMemoryBytes: 0,
    peakRssBytes: 0,
    peakCpuCorePercent: 0,
  });
  stage.samples++;
  stage.peakMemoryBytes = Math.max(stage.peakMemoryBytes, memory);
  stage.peakRssBytes = Math.max(stage.peakRssBytes, rss);
  stage.peakCpuCorePercent = Math.max(stage.peakCpuCorePercent, cpuPercent);
  report.samples++;
  report.observedPeakMemoryBytes = Math.max(
    report.observedPeakMemoryBytes,
    memory,
  );
  report.observedPeakProcessRssBytes = Math.max(
    report.observedPeakProcessRssBytes,
    rss,
  );
  report.peakCpuCorePercent = Math.max(report.peakCpuCorePercent, cpuPercent);
  report.peakCpuMachinePercent = report.peakCpuCorePercent / cores;
  report.kernelMemoryPeakAtEnd = Number(
    readFileSync(path.join(group, "memory.peak"), "utf8"),
  );
  writeFileSync(
    path.join(output, "resources.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  prior = { now, cpu };
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log("Nivra service RAM and CPU sampling completed.");
