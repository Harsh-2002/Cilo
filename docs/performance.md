# Library performance and browser review

Nivra keeps SQLite local and encrypted. The active browser session loads note previews in pages of 60, with full documents fetched only when opened. Tag lookups are batched. Linked task and bookmark titles use joins rather than one extra lookup per item. Tasks and bookmarks are paged by the server in 60-row pages using stable keyset cursors, with a Load more action. Status filters, search, favorites, collection filters, counts and the collection list are computed in SQLite, so the browser never holds the complete section. Migration 0012 adds the matching ordering indexes.

Migration 0011 adds covering search-order indexes. Global search chooses bounded result IDs before fetching FTS5 snippets for those results. Match markers become plain text and character ranges, rendered by React; imported content is never inserted as search-result HTML. A bounded 128-entry fuzzy-query cache invalidates after writes from this connection or another SQLite connection.

## Synthetic library benchmark

Run `npx tsx scripts/benchmark-library.ts`. It always creates and removes its own temporary encrypted data directory, overriding any existing data-directory environment setting. It seeds 10,000 notes, 5,000 tasks and 5,000 bookmarks, with linked notes and unique vocabulary. It performs twelve calls per operation; warm figures summarize the last ten. This measures server functions, not browser/network latency. The first measured call is not an operating-system cold-cache test.

Recorded on this development VM on 2026-10-05:

| Operation                    |          Earlier warm median |            Updated warm median | Updated response size |
| ---------------------------- | ---------------------------: | -----------------------------: | --------------------: |
| Initial note list            | 2,687ms for all 10,000 notes | 6ms for a 60-note preview page |          24,721 bytes |
| Linked tasks                 |                      4,540ms |                          431ms |       1,685,561 bytes |
| Linked bookmarks             |                      1,544ms |                          482ms |       2,129,451 bytes |
| Common global search         |                        814ms |                          135ms |           7,693 bytes |
| Repeated typo search         |                      1,023ms |                           46ms |           7,693 bytes |
| Repeated missing-term search |                        300ms |                           18ms |               2 bytes |

The earlier full note list was 20,375,339 bytes. Paging and truncating previews provide the deterministic payload reduction; timing differences are indicative because machine load varied between runs. First measured typo/missing-term requests still took approximately 570/654ms on this large fixture before the cache was warm. This is not a latency guarantee or proof that every library size is equally fast.

### Paged tasks and bookmarks

Measured on the same 5,000-task and 5,000-bookmark fixture with `npx tsx scripts/benchmark-library.ts` on 2026-10-05 (server functions only; warm medians of ten calls):

| Operation                                 | Full list (before)  | Paged (after)               |
| ----------------------------------------- | ------------------- | --------------------------- |
| Tasks, first view                         | 389ms, 1,685,561 B  | 1.4ms, 19,848 B for 60 rows |
| Tasks, deep page by cursor                | not available       | 5.2ms, 20,371 B             |
| Task search ("task 4999")                 | client-side         | 18ms, 361 B                 |
| Task counts                               | derived client-side | 2.2ms, 27 B                 |
| Bookmarks, first view                     | 403ms, 2,129,451 B  | 1.4ms, 25,701 B for 60 rows |
| Bookmarks, deep page by cursor            | not available       | 4.2ms, 25,104 B             |
| Bookmark search ("nebula reference 4999") | 22ms, whole list    | 22ms, 877 B                 |
| Bookmark total and collection list        | derived client-side | 4.5ms, 31 B                 |

Cursors are keyed on the sort columns (due date, creation time and identifier for tasks; creation time and identifier for bookmarks) rather than row offsets, so completing, deleting or editing an item between pages cannot skip or repeat other items. Task search folds case with the browser's Unicode rules through a registered SQLite function; it scans only the owner's matching status rows and is not backed by FTS5. Page size is capped at 100 rows on the server. Bookmark search keeps FTS5 with substring and typo fallback.

## Media delivery

`npx tsx scripts/benchmark-media.ts` writes a 25 MiB and a 100 MiB (the upload maximum) encrypted file, then measures each scenario in its own process so peak memory is attributable. "Legacy" is the earlier behavior: authenticate and decrypt the whole `CILOENC1` object, then slice. Measured on this VM on 2026-10-05; timings vary by roughly 2x between runs on this shared host, so peak memory is the stable result.

| File    | Scenario                      | Median time | Peak RSS growth |
| ------- | ----------------------------- | ----------: | --------------: |
| 25 MiB  | Seek, 1 MiB, legacy           |       129ms |         203 MiB |
| 25 MiB  | Seek, 1 MiB, chunked          |        41ms |          39 MiB |
| 25 MiB  | Full download, legacy         |       192ms |         299 MiB |
| 25 MiB  | Full download, chunked stream |       335ms |          79 MiB |
| 100 MiB | Seek, 1 MiB, legacy           |       577ms |         405 MiB |
| 100 MiB | Seek, 1 MiB, chunked          |        40ms |          42 MiB |
| 100 MiB | Full download, legacy         |       834ms |         540 MiB |
| 100 MiB | Full download, chunked stream |     1,242ms |          83 MiB |

Seeking no longer scales with file size. A full chunked download is slower than a single in-memory decrypt (about 85 MB/s here, well above media bit rates) in exchange for bounded memory. Concurrent seeks multiply the per-request figure, not the file size. The 40 MiB floor includes runtime and allocator overhead, not file data. This measures server functions and response streaming, not browser decoding or network latency.

## Browser harness

The browser review uses a separate owner and encrypted instance on port 3004, configured with `NIVRA_PUBLIC_URL=http://localhost:3004` to match the runner origin. `scripts/seed-library-review.ts` refuses other directories or owners. `scripts/run-capture-review.mjs` uses a protected temporary session file and runs the same interactions through Playwright Chromium, Firefox and WebKit; browser binaries can be installed with `npx playwright install firefox webkit`, plus the platform dependencies where needed. The review context blocks service workers so injected network failures are intercepted consistently; this run does not verify the PWA service worker. Playwright is a development dependency and is excluded from the runtime image.

```sh
npx tsx scripts/seed-library-review.ts /tmp/cilo-capture-review-EXAMPLE
node scripts/run-capture-review.mjs /tmp/cilo-capture-review-EXAMPLE
```

These commands require a previously started disposable production artifact with the synthetic Capture Review Owner, its `review-data/` directory and authenticated `session.json`; they deliberately do not create or log into the real owner instance. The seeder refuses an already populated review library. Screenshots remain ignored under `.impeccable/review/`; credentials and generated data must never be committed.

The harness checks capture layouts at 1440, 768, 390 and 320px in both themes, retained closed/failed drafts, note/task edits preserved while capturing, automatic link recognition, safe fallback bookmark cards, matching excerpts/highlights, relevant-block navigation, incremental lists and reload persistence. Engine automation does not certify physical iOS/Android keyboards or installed PWA behavior. See [verification results](verification.md) for the actual run outcomes.
