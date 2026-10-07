# Large-library audit — 7 October 2026

This audit uses the owner-authorized development instance served directly from the project checkout on port 3000. The fixture manifest contains 10,000 notes, 10,000 journal entries, 10,000 tasks, 10,000 bookmarks and 10,000 artifacts. Existing owner items are preserved. Artifacts include 9,000 text items, 500 PDFs and 500 PNGs; all 1,000 file extractions completed. There are 20 fixture tags, two tags per item across all five sections (100,000 associations), 5,000 favorite notes/journal entries and 2,500 favorite bookmarks.

## Query findings

SQLite already used WAL, a 5-second busy timeout, a 32 MiB connection cache, a 1,000-page automatic checkpoint, and 25 application indexes before this change (30 after the tag and Trash indexes). FTS5 indexes exist for notes, tasks, bookmarks and artifacts. WAL allows readers alongside a writer; it does not permit simultaneous writers. Durability and encryption settings were retained. Migration 0017 adds tag relationships for tasks, bookmarks and artifacts, plus reverse lookup indexes, while preserving existing note tags. Migration 0018 adds the missing partial index for deleted notes and journals. See the [SQLite WAL documentation](https://sqlite.org/wal.html).

The default note list omitted the owner predicate even though its ordered indexes begin with owner ID. That forced scans and sorting on the large library. Passing the authenticated owner to the query allows SQLite to use the existing owner index prefix. Bounded full-text lists now stream native FTS relevance order and hydrate only the requested page; equal-rank results follow FTS order rather than an extra UUID sort. Full pagination checks cover every fixture without omissions or duplicate IDs.

Trash had deleted-item indexes for tasks, bookmarks and artifacts, but none for notes and journals. Its first measured API median was 780 ms while scanning the 20,000 active note/journal fixtures. The new partial index keeps active records out of that lookup. The upgraded live database used the index, preserved all nine deleted items, passed integrity checking, and returned the combined SQL collection in 0.8 ms median over 20 warm calls. API timings include additional server and network work.

Global search previously generated snippets for up to 48 candidates before retaining 30 results, reopening an FTS cursor per result. It now selects the final results first and fetches context in one cursor per item type. The paired comparison found identical result identities and ordering, but the old repeated cursor could return another row's title/context. The new results were checked against canonical stored titles, with Unicode, deep-text and tag-filter regression coverage.

Ten paired SQL samples against the same encrypted library gave these medians. These are warm SQL timings rather than browser latency, and browser verification was running on the host during parts of the comparison.

| Query                              |   Before |  After |
| ---------------------------------- | -------: | -----: |
| Notes first page                   |   734 ms |  11 ms |
| Journal first page                 | 1,125 ms |   3 ms |
| Favorite notes/journals first page |   753 ms |  30 ms |
| Global broad search (`scale`)      | 1,118 ms | 181 ms |
| Global tag and text search         |   286 ms |  83 ms |
| Global unique-token search         |    76 ms |  72 ms |
| Global deep-text search            |    34 ms |  37 ms |

## Single-user development-server measurement

After the final index upgrade and completed source checks, one driver made 20 sequential requests per endpoint with 150 ms between requests. It first warmed the endpoints, held one SSE connection through 60 seconds of idle, and finished with 30 seconds of idle after browsing. No local test suite, production build or backup ran during the measurement. The shared host and development compiler remain sources of variation; these are API response timings rather than page-render or Core Web Vitals measurements.

| Endpoint               | Median | 95th percentile |
| ---------------------- | -----: | --------------: |
| Overview               | 206 ms |          334 ms |
| Notes                  | 176 ms |          503 ms |
| Journal                | 151 ms |          343 ms |
| Mixed Favorites        | 121 ms |          193 ms |
| Tasks                  |  77 ms |          117 ms |
| Bookmarks              |  93 ms |          240 ms |
| Artifacts              |  80 ms |          110 ms |
| Trash                  |  77 ms |          198 ms |
| Tagged collection      |  75 ms |          131 ms |
| Unique-token search    | 104 ms |          171 ms |
| Broad full-text search | 231 ms |          435 ms |
| Tag and text search    | 147 ms |          234 ms |

Trash improved from 780 ms median before the missing index to 77 ms after it. An earlier run had Notes/Journal medians of 86/83 ms; the final run recorded 176/151 ms. The database query improvement is reproducible, but the development host does not provide a fixed latency guarantee.

The service cgroup includes the application, compiler children, native allocations and charged filesystem cache. During sequential browsing it peaked at 1.54 GiB, averaged 155.8% of one CPU core and peaked at 246.9% in a one-second sample. On this four-core host those CPU values are 38.9% average and 61.7% peak of total capacity. The first idle interval averaged 9.0% of one core (2.25% of host capacity), including a 227.3% spike; the immediate post-browsing interval averaged 23.0% of one core. Median idle samples were much lower, but the spikes must not be discarded as zero CPU. Development child-process activity was observed during this run; it does not isolate the cost of SQLite or encryption.

A separate follow-up allowed 30 seconds to settle and sampled 60 seconds with one SSE connection. Median CPU was 0.358% of one core (0.09% of host capacity), but the average was 34.7% of one core (8.68% of the host) and the one-second peak was 246.7% (61.7% of the host). Cgroup memory peaked at 1.42 GiB in that interval. The low median does not establish the requested near-zero average idle target: that target remains unmet in the measured development runtime. Further profiling must attribute these intermittent child-process/GC/compiler spikes before claiming they are fixed.

Earlier bulk pagination, compilation and processing overlapped, reaching 367.3% of one core (91.8% of this host) and 2.56 GiB of cgroup memory. That is a mixed verification workload, not normal browsing. The configured development service memory limit is a guard rather than evidence of leak-free behavior. A longer-duration leak test and production-runtime capacity benchmark remain unverified.

## Functional and security checks

The live pagination pass visited 167 pages for each collection and found all 50,000 fixture IDs. Separate checks covered all 20 tag filters, full pagination through 5,000 favorite notes/journal entries, 2,500 favorite bookmarks and their combined 7,500-item Favorites collection, all supported search types, and matches beyond the displayed preview in both a note and an artifact.

Targeted live security checks passed for unauthenticated item/search/file/SSE access, cross-origin writes, malformed input, owner-setup reuse, blocked public signup, traversal-shaped identifiers, stale revision rejection, safe PDF download headers, SQL/FTS-shaped input and refusal to fetch private-network bookmark metadata. Synthetic security links are moved to Trash. These checks are an application audit, not an independent penetration test.

The final source checks passed: type checking, lint, formatting, branding, all 123 tests and the production build, including the private-data shipping guard. Browser checks passed across Chromium, Firefox and WebKit for the five main content sections at desktop and phone sizes; separate checks covered mixed Favorites, tag collections, tag saves, search geometry, mobile Search/Settings navigation and Overview layouts. The full-instance encrypted backup restored successfully, including tag relationships. Browser emulation does not certify physical devices, assistive technology or installed-PWA behavior.

## Interface behavior

Favorites shares the organization-only card layout for starred notes, journals and bookmarks. Notes and Journal have their own descriptions and creation actions. Mobile Search and Settings are full-screen app pages with back navigation and persistent URLs; desktop dialogs remain. Search is 680px wide on desktop and retains its dimensions through loading, with a stronger dimmed backdrop and opacity-only transitions. Overview uses equal-height desktop cards that fill the available workspace, bounded 20-item lists and independent scrolling. Phones retain their compact recent-item lists. Tag selection opens an organization-only collection across notes, journals, tasks, bookmarks and artifacts, without creation actions. Shared tag pickers support tasks, bookmarks and artifacts, while notes and journals retain their existing editor controls. Revision checks protect tag saves; Trash preserves relationships, recurring tasks inherit tags, and task/bookmark bundle round trips and full-instance recovery preserve them.

Vertical scrollbar tracks are hidden while scrolling remains functional. Named collection regions and Overview lists support keyboard scrolling. Horizontal scrolling bars remain for wide code, tables and diagrams; system forced-colors mode restores native scrollbars. Guidance: [MDN scrollbar accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-width#accessibility).

## Encryption and file memory

Encryption defaults on and can be disabled only before a new installation's first startup. The saved mode rejects later changes; authentication secrets and recovery backups stay encrypted in both modes. See [self-hosting](self-hosting.md#encryption-and-key-custody).

A separate synthetic comparison on 6 October used 5,000 items per section, three fresh processes per mode, a 32 MiB SQLite cache and 30 warm calls per workload. Ordinary warm reads were close: Overview was 16.54 ms without encryption and 17.72 ms encrypted; updating 100 tasks was 14.04 versus 16.66 ms. The first Notes read with a fresh SQLite cache was 112 versus 425 ms. Median process high-water RSS was 159.6 versus 162.0 MiB. This does not establish a useful idle-memory saving from disabling encryption; compiler and OCR costs are separate.

Large local file operations showed a larger cost. These are medians of three processes, including adapter work and I/O, with filesystem caches retained; they do not isolate cipher instructions or measure S3 latency.

| Operation     | Unencrypted wall / CPU | Encrypted wall / CPU |
| ------------- | ---------------------: | -------------------: |
| Read 25 MiB   |           252 / 323 ms |         389 / 627 ms |
| Write 25 MiB  |           190 / 226 ms |         518 / 630 ms |
| Read 100 MiB  |           704 / 850 ms |     1,642 / 2,043 ms |
| Write 100 MiB |           609 / 500 ms |     1,727 / 1,854 ms |

Bounded ciphertext reads and transferring one owned plaintext buffer to the extraction worker removed redundant copies. In three-process encrypted comparisons, processing two 25 MiB files reduced median high-water RSS from 319 to 212 MiB; two 100 MiB files from 747 to 385 MiB. The live default upload limit is 25 MiB; the larger values are synthetic tests of the configurable maximum. These results support lower processing peaks, rather than a long-duration leak audit.

## Reproducing checks

Use Node.js 24. Run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run verify:branding`, `npm test` and `npm run build`. Browser harnesses use Playwright with Chromium, Firefox and WebKit; captures and credentials remain ignored and private. Production Docker and S3 integration use disposable data; see [the S3 integration procedure](rustfs-testing.md).

`scripts/scale-fixtures.ts` requires `NIVRA_SCALE_ALLOW=dev-instance-fixtures`, the target installation's storage/key configuration, an absolute private output directory and exactly one owner. Its `seed`, `extend` and `enrich` commands create synthetic items, tags and favorites; `verify` checks fixture identity and integrity; `session` and `revoke` manage only a short-lived audit credential. The final argument selects 1,000, 5,000 or 10,000 items per section. These commands mutate the selected installation and require explicit authorization.

`node scripts/audit-scale.mjs /absolute/private-output https://notes.example.com` checks full pagination, latency, targeted security behavior and browser layouts. `audit-library-filters.mjs` checks favorite pagination and mixed tag collections against the same fixture manifest. `audit-single-user.mjs` measures warmed sequential API use and idle SSE CPU/RAM for the selected service cgroup. Run it without compilation, backup or another load driver. These measurements include network and development-server overhead, rather than Core Web Vitals or a production capacity guarantee.

`node --import tsx scripts/benchmark-encryption.ts run /absolute/new/private-directory` compares both storage modes using disposable generated data without changing the live installation. `scripts/benchmark-library.ts` and `scripts/benchmark-media.ts` likewise create isolated synthetic benchmarks. Keep raw databases, keys, sessions, host measurements and screenshots outside Git.

Public sharing now prepares HTML at publish time and serves it through an indexed SQLite lookup. In a development-server restart check, the first successful request took 5.44 seconds and the next took 0.13 seconds, compared with an earlier 61-second first request dominated by Next.js compilation. The reader runtime is prebuilt before startup. These timings are a sharing-path check, not a new CPU, memory or whole-instance benchmark.
