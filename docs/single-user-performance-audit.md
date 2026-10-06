# Single-user performance audit

Measured on 6 October 2026 against the same checkout and encrypted data served at `https://dev.l3b.cc.cd`. The existing 5,000 fixtures per section remain in place: 25,000 notes, journal entries, tasks, bookmarks and artifacts in total, plus owner items. No replacement instance or additional bulk seed was used.

This is a fresh application review and before/after measurement, not an independent external performance certification. The earlier 90.3% whole-machine CPU peak included bulk uploads and OCR. It must not be interpreted as idle usage. The owner selected near-zero idle CPU and lower browsing spikes as the target.

## Findings and changes

Opening Overview eagerly fetched every collection, including hidden note lists. The desktop and phone baseline each issued 15 API requests during startup, excluding the shared SSE connection. Loading only the visited section reduced this to four requests, a 73% reduction. Last-known first pages remain cached in memory for revisits; private data is not persisted in browser caches. The tradeoff is that a first visit loads that section on demand rather than having been fetched speculatively.

Overview independently refreshed every 30 seconds even with SSE connected. Both baselines recorded two periodic API requests during a 65-second idle window. Both updated browser runs recorded zero. Overview still refreshes on entry, focus, visibility, local actions, completion events and a change of local calendar date. The shared SSE client retains its disconnected-stream fallback, heartbeats and session revocation behavior.

Artifact card searches calculated matched excerpts for every returned item, although the cards only display filenames and previews. Local profiling measured broad artifact searches at 354–403 ms, compared with roughly 2–3 ms for an unfiltered page. Calculating individual snippets took 439–567 ms in a separate query comparison; batching them still took 335–346 ms. The gallery now requests `context=0` to search the same full-text index without generating unused excerpts. Default API searches and unified search retain matched context. Original content, extraction, indexing, authorization, cursor ordering and viewer metadata are preserved.

The idle job claim lookup used its existing index and took 0.23–0.44 ms in the local comparison. There was no evidence to justify changing durable leases, retry semantics or the two-slot processing limit merely to reduce idle CPU.

## API measurements

Each endpoint was warmed, then measured through HTTPS with 20 sequential requests and a 150 ms pause after each request. These are API response times, including the network and development-server overhead, rather than browser interaction or Core Web Vitals measurements. Section lists request at most 60 items. Favorites and Trash contain the instance's existing smaller datasets rather than 5,000 additional fixtures.

| API                        | Before median / p95 | After median / p95 |
| -------------------------- | ------------------- | ------------------ |
| Overview                   | 92 / 201 ms         | 81 / 149 ms        |
| Notes                      | 91 / 282 ms         | 97 / 201 ms        |
| Journal                    | 159 / 333 ms        | 156 / 316 ms       |
| Favorites                  | 75 / 177 ms         | 76 / 244 ms        |
| Tasks                      | 73 / 171 ms         | 70 / 123 ms        |
| Bookmarks                  | 73 / 160 ms         | 86 / 164 ms        |
| Artifacts, unfiltered      | 69 / 137 ms         | 72 / 223 ms        |
| Trash                      | 71 / 155 ms         | 76 / 189 ms        |
| Unified search             | 91 / 191 ms         | 88 / 238 ms        |
| Broad artifact card search | 459 / 849 ms        | 79 / 199 ms        |

The artifact comparison measures the old rich search response against the new gallery request without excerpts. Its median improved by about 83% and its p95 by about 77%. The other APIs show normal variation; these numbers do not establish an improvement for every section.

## CPU and memory

The host has four CPU cores. Sampling reads the Nivra systemd service's cgroup every second: 100% core-equivalent means one busy core, and division by four gives whole-machine percent. Browser and audit-driver processes are outside that cgroup. Memory includes charged file cache as well as service processes. Sampled peaks can miss shorter bursts; these are observed window peaks, not the cgroup's lifetime high-water mark.

Updated Chromium browser runs used 1440px/light and 390px/dark contexts. Each allowed startup to settle, observed Overview for 65 seconds, then visited all eight sections and verified focus refresh. The idle results were:

| Idle Overview   | Median core / machine CPU | Average core / machine CPU | Peak core / machine CPU |
| --------------- | ------------------------- | -------------------------- | ----------------------- |
| Desktop         | 0.23% / 0.06%             | 2.10% / 0.53%              | 46.15% / 11.54%         |
| Phone emulation | 0.24% / 0.06%             | 0.28% / 0.07%              | 0.88% / 0.22%           |

The previous browser idle averages were 14.40% of one core on desktop and 52.93% on mobile. The removed periodic requests and eager fetches explain eliminated work, but these different development-server windows do not isolate every contribution to the CPU change. Development compilation, hot reloads, garbage collection and other owner traffic can affect this live instance. The desktop idle spike remains visible in the report rather than being hidden by the average.

During the rapid API loop, the updated service averaged 153% of one core (38.25% of the host), with a sampled peak of 266% (66.49% of the host). Its observed memory peak was 1.93 GiB, compared with 1.53 GiB in the earlier API window. The existing process had been hot reloaded between runs. RAM did not improve in this measurement, and the loop is substantially busier than a person reading between actions. CPU and RAM improvements under bulk OCR were not re-benchmarked by this change.

Startup CPU still reached roughly 46% of the whole host in one phone sample. These results support near-zero steady idle and less unnecessary traffic; they do not prove that compilation or first visits have no spikes. Browser navigation timings included automation waits and varied across runs, so they are not used as INP or a claim of uniformly faster first visits. Production-mode capacity, physical-device responsiveness, browser CPU/memory, saturation limits and long-duration leak testing remain unmeasured by this audit.

## Verification and reproduction

The browser checks covered all eight sections on desktop and phone, with no JavaScript errors or horizontal overflow. They asserted the reduced startup request count, zero periodic Overview requests and successful focus refresh. The final captures were inspected. A new 1,000-match regression checks identical artifact results/cursors with and without excerpts, matches deep inside content beyond the preview, full pagination without duplicates, matched context when requested, and exclusion of trashed items and other owners. The API regression also checks `context=0` through the authenticated route.

Type checking, lint, formatting, branding, all 109 automated tests and the production build passed. The live dev service stayed active and domain health returned 200. Fixture verification confirmed all 5,000 items per section, all 500 processed files and encrypted database integrity. The temporary audit session was revoked; its next private API request returned 401. The existing security and scale report remains at [performance-security-audit.md](performance-security-audit.md); this change does not constitute another penetration test.

`scripts/audit-single-user.mjs` reproduces the API and service sampling sequence. First create a short-lived session with the trusted `scripts/scale-fixtures.ts session` command and the existing instance's configuration; store its `session.json` in a private absolute output directory. Supply that directory, the dev base URL, the service's absolute cgroup directory and an optional report label to the audit script. It samples idle with SSE for 60 seconds, the ten API workloads, then idle without the audit SSE connection for 30 seconds. Run without concurrent tests, builds or edits, preserve existing owner data, and revoke the audit session afterward. Reports and credentials remain outside Git.
