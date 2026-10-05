# Library performance and browser review

Cilo keeps SQLite local and encrypted. The active browser session loads note previews in pages of 60, with full documents fetched only when opened. Tag lookups are batched. Linked task and bookmark titles use joins rather than one extra lookup per item. Tasks and bookmarks initially render 60 rows, with a Load more action; their existing APIs still fetch the complete section so counts and client-side filters remain accurate.

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

The earlier full note list was 20,375,339 bytes. Paging and truncating previews provide the deterministic payload reduction; timing differences are indicative because machine load varied between runs. First measured typo/missing-term requests still took approximately 570/654ms on this large fixture before the cache was warm. This is not a latency guarantee or proof that every library size is equally fast. Further server pagination for tasks/bookmarks remains a future scaling improvement.

## Browser harness

The browser review uses a separate owner and encrypted instance on port 3004, configured with `CILO_PUBLIC_URL=http://localhost:3004` to match the runner origin. `scripts/seed-library-review.ts` refuses other directories or owners. `scripts/run-capture-review.mjs` uses a protected temporary session file and runs the same interactions through Playwright Chromium, Firefox and WebKit; browser binaries can be installed with `npx playwright install firefox webkit`, plus the platform dependencies where needed. The review context blocks service workers so injected network failures are intercepted consistently; this run does not verify the PWA service worker. Playwright is a development dependency and is excluded from the runtime image.

```sh
npx tsx scripts/seed-library-review.ts /tmp/cilo-capture-review-EXAMPLE
node scripts/run-capture-review.mjs /tmp/cilo-capture-review-EXAMPLE
```

These commands require a previously started disposable production artifact with the synthetic Capture Review Owner, its `review-data/` directory and authenticated `session.json`; they deliberately do not create or log into the real owner instance. The seeder refuses an already populated review library. Screenshots remain ignored under `.impeccable/review/`; credentials and generated data must never be committed.

The harness checks capture layouts at 1440, 768, 390 and 320px in both themes, retained closed/failed drafts, note/task edits preserved while capturing, automatic link recognition, safe fallback bookmark cards, matching excerpts/highlights, relevant-block navigation, incremental lists and reload persistence. Engine automation does not certify physical iOS/Android keyboards or installed PWA behavior. See [verification results](verification.md) for the actual run outcomes.
