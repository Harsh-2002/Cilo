# Performance and security audit

Audit date: 6 October 2026. The owner requested testing on the running dev instance and later expanded the dataset to 5,000 entries of each type. Existing owner items were preserved, so total instance counts can exceed the fixture counts.

The follow-up [single-user performance audit](single-user-performance-audit.md) separates idle browsing from this bulk workload and records subsequent on-demand loading and artifact search improvements.

## Dataset and method

The fixture set contains 5,000 notes, 5,000 journal entries, 5,000 tasks, 5,000 bookmark links and 5,000 artifacts: 25,000 test objects. Titles start with **Scale test**. Journal dates start in 2080 to avoid the owner's existing days. Notes and journals contain varied text lengths, including longer documents; tasks include linked notes, due dates and completed items. Artifacts contain 4,500 text items, 250 PDFs and 250 PNG images.

Bookmarks use unique example.com URLs and seeded metadata. This measures indexing, search, pagination and rendering without sending 5,000 metadata requests to another website. Initial fixtures used canonical server models and trusted SQLite inserts. The expansion's 400 additional files used the authenticated live upload API and the real durable processing queue. Fixture manifests, audit sessions, captures and raw measurements stay outside Git. A recovery-verified encrypted backup preceded changes to the live dataset.

Tests address the same checkout served at `https://dev.l3b.cc.cd`, running Next.js development mode on port 3000. Measurements include the proxy and development runtime overhead. This is a shared Linux host with four virtual Skylake CPU cores and approximately 11.6 GiB RAM. It is not a production-capacity or physical-phone certification.

Pagination walks every fixture through the API and checks for missing or duplicate identifiers. Warm latency samples cover first-page retrieval in each populated section, unified search and Overview. A separate workload issues 100 requests at concurrency ten. Browser checks cover Chromium, Firefox and WebKit at 390px and 1440px, checking populated sections, bounded initial rendering, settled loading, overflow and JavaScript errors.

The resource monitor samples the Nivra systemd service's cgroup every second. Service memory includes its processes and charged file cache; summed process RSS is reported separately. CPU is expressed as core-equivalent percent (100% means one busy core) and divided by four for whole-machine percent. Fixture-loader and browser processes are outside this service measurement. Sampled peaks can miss shorter spikes; the kernel cgroup memory peak is an additional lifetime measurement.

## Measured API results

Thirty samples per endpoint after an initial request; values are milliseconds through the dev domain. These are populated first-page searches, not retrieval of every document at once.

| Endpoint       | Median | 95th percentile | Maximum |
| -------------- | -----: | --------------: | ------: |
| Notes          |    143 |            1690 |    2213 |
| Journal        |    142 |             248 |     268 |
| Tasks          |     75 |             431 |    1427 |
| Bookmarks      |     82 |             305 |    1129 |
| Artifacts      |    476 |             673 |    1282 |
| Unified search |     81 |             144 |     187 |
| Overview       |     78 |             173 |     176 |

All 5,000 fixtures per type passed pagination, with 84 pages per type and no missing or duplicated fixture IDs. A mixed 100-request workload at concurrency ten completed in 23.85 seconds. The 400 expansion uploads acknowledged at median 153 ms and 95th percentile 392 ms while processing continued asynchronously. All 500 file fixtures subsequently reached the done state. A live SSE observation received 23 completion events, one resync and three heartbeats, with no private document payloads.

Notes still had a 1.69-second 95th percentile despite a 143 ms median; the development run has meaningful latency spikes. These results do not establish a production throughput ceiling or eliminate the need for further latency profiling.

## Measured service resources

| Workload                                              | Sampled memory peak | Summed process RSS peak | CPU peak, core-equivalent | CPU peak, four-core machine |
| ----------------------------------------------------- | ------------------: | ----------------------: | ------------------------: | --------------------------: |
| Expansion, processing and initial 25,000-object audit |            2.22 GiB |                1.57 GiB |                    361.2% |                       90.3% |
| Optimized API audit and first browser attempt         |            1.59 GiB |                1.49 GiB |                    324.5% |                       81.1% |
| Completed browser retry                               |            1.41 GiB |                1.30 GiB |                    227.6% |                       56.9% |

Sampling retained 1270 one-second observations. The highest sampled service memory was 2.22 GiB and CPU was 361.2% of one core, equivalent to 90.3% of four cores. Workloads differ: the first window includes uploads and OCR, while the final API window follows processing completion. Lower final peaks are not a controlled measurement of the cache change alone. Kernel memory peaks were already present at each monitor start and did not increase, so their service-lifetime values are not attributed to this workload.

All 30 populated section/browser/viewport checks passed on the complete rerun. An initial browser attempt did not complete; step diagnostics were added and the complete rerun passed. These are warm development browser checks, not a guarantee of first-boot compilation latency. The final matrix found no JavaScript errors or horizontal overflow, and each section rendered no more than 60 initial rows. Mobile and desktop artifact captures were inspected visually.

## Findings and fixes

Broad notes searches used a correlated FTS rank subquery for each matching note. An isolated comparison of the old query exceeded a 15-second process deadline. Joining the search index once returned a 60-result page in approximately 0.56 seconds during the same loaded-host investigation. Ranked ordering, journal separation, stable pagination and prefix lookup are covered by a new 1,000-match regression test. No encryption or revision checks were relaxed.

At 25,000 objects, the default 2 MiB SQLite page cache repeatedly evicted pages used by broad encrypted FTS searches. A read-only comparison measured repeated searches at 556–684 ms with the default cache and 60–82 ms after warming a 32 MiB cache. Connections use the bounded 32 MiB target; that audit kept encryption enabled. The later first-start opt-out and file-memory measurements are documented in [encryption-memory-audit.md](encryption-memory-audit.md). The large OCR batch also exposed FIFO starvation of newly saved bookmark jobs. The two-slot scheduler now favors different ready job kinds, with durable leases and retry behavior unchanged; a regression test checks priority and fallback.

The favicon's white rectangle caused the border seen against a dark browser tab. The SVG and generated regular icons now have transparent outer pixels; versioned icon URLs invalidate the previous asset. Generated alpha values and a dark-background rendering were inspected.

KaTeX was overridden to patched version 0.18.2, removing the production dependency advisory. Direct fraction/superscript rendering and browser Mermaid rendering were checked, and the production build passed. The associated [KaTeX advisory](https://github.com/advisories/GHSA-238p-pmpm-9mq7) describes a bypass requiring existing prototype pollution.

The complete dependency audit still reports five high-severity affected packages in the ESLint/Next lint chain, tracing to one [unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The registry's current braces release remains 3.0.3; the advisory lists no patched release. This is development tooling operating on repository glob patterns, outside the shipped application request path. A production-only dependency audit reports zero advisories. Downgrading the framework's lint integration solely to suppress the report was rejected as an inappropriate fix.

## Security coverage

The live checks verify anonymous denial of private lists, search, notes, file serving and SSE; rejection of cross-origin writes; invalid documents/dates and non-HTTP bookmark URLs; disabled public signup and repeated owner setup; nonexistent and traversal-shaped identifiers; stale revisions; and PDF download headers, no-store caching and nosniff. SQL/FTS-shaped queries remain bounded and avoid server errors.

Private URLs may be saved as links, while background metadata fetching refuses private destinations. The live test verifies the resulting unavailable metadata state and moves its synthetic audit link to Trash. This is distinct from fetching a private URL successfully. SSRF address, redirect, DNS and preview-asset defenses also have automated coverage.

The full automated suite passed 108 tests, covering authentication and recovery, optional MFA, encrypted storage/tamper/wrong-key behavior, migration, files, import/export, backups, revisions, durable jobs, restart recovery, SSE and unified Trash. These checks are a focused application audit, not an independent penetration test or proof that every possible vulnerability is absent.

Final live checks verified encrypted database integrity, the single-owner/account invariant, unchanged encryption and authentication secrets, local/LAN/domain health, and recovery of a full-instance encrypted backup containing the expanded dataset. The temporary audit session was revoked and its next private API request returned 401. Synthetic security-test links were moved to Trash; all 25,000 dataset fixtures remain active for owner inspection.

## Reproducing the audit

`scripts/scale-fixtures.ts` requires `NIVRA_SCALE_ALLOW=dev-instance-fixtures`, the existing instance's storage/key configuration, an absolute private output directory and exactly one owner. Its `session` command creates a short-lived local audit session; `seed` creates a new manifest, `extend` expands an existing manifest, `verify` checks persisted fixture identifiers and integrity, and `revoke` removes only the audit session. The final argument selects 1,000 or 5,000 items per type. Run it with the repository's Node 24 and tsx tooling. This utility requires trusted local access and is not a public API.

Run `node scripts/audit-scale.mjs /absolute/private/output https://dev.l3b.cc.cd` after fixture verification. It writes aggregate results without owner documents or credentials. `--resume` retains completed timing/pagination results while rerunning security and browser checks. Run `scripts/monitor-scale.mjs` with the private output directory and service cgroup path during the workload; a `stop-monitor` file ends sampling. Revoke the audit session after finishing. The owner requested keeping the test objects available for inspection; this workflow does not delete them automatically.
