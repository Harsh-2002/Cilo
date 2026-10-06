# Encryption cost and file-processing memory

Measured on 6 October 2026 with Node.js 24.21.0 on the same four-core Intel Skylake virtual host as `https://dev.l3b.cc.cd`. The dev installation remains encrypted, with its existing owner data and 5,000 fixtures per section. The comparison used generated data in private disposable directories, without running another application instance, copying owner data into plaintext or switching the live installation's mode.

## Storage choice

Database/file encryption is on by default. A new installation can set `NIVRA_ENCRYPTION_ENABLED=false` before its first startup. An owner-only `encryption-mode.json` persists the choice; leaving the variable unset on later starts uses that mode. Explicit conflicting values fail. Established pre-mode installations stay encrypted and retain the resumable legacy migration. In-place conversion between modes is not implemented.

The choice covers SQLite, its search indexes/WAL, and local/S3 attachments, artifact originals, thumbnails and published copies. Authentication secrets, backup state, backup objects and manifests remain encrypted in both modes. Backup manifests record the selected mode, and restore recreates it after integrity verification. Older manifests without this field mean encrypted storage. The original key is still needed for authentication secrets and recovery, including an installation that opted out. Readable storage removes protection for someone who obtains the database or file objects; login, server authorization, upload restrictions and private-cache exclusions still apply.

## Database comparison

Both modes used the same SQLite driver, schema, 32 MiB page-cache setting and deterministic contents: 5,000 notes, 5,000 journal entries, 5,000 tasks, 5,000 bookmarks and 5,000 text artifacts. Bodies included ordinary content and longer documents every hundredth item. No metadata fetches or OCR ran during this database comparison. The databases occupied 55.99 MiB without encryption and 56.57 MiB encrypted, about 1% additional space.

Each mode ran in three fresh processes, alternating order. Each workload was called once, then measured 30 times. The table reports the median of the three warm-process medians. List calls return 30 items and use the application's server functions; these timings exclude HTTP, authentication, React rendering and Next.js compilation.

| Warm workload                  | Unencrypted | Encrypted | Difference |
| ------------------------------ | ----------- | --------- | ---------- |
| Notes                          | 12.86 ms    | 12.84 ms  | -0.02 ms   |
| Journal                        | 68.20 ms    | 64.07 ms  | -4.13 ms   |
| Tasks                          | 0.913 ms    | 0.907 ms  | -0.006 ms  |
| Bookmarks                      | 1.42 ms     | 1.62 ms   | +0.20 ms   |
| Artifacts                      | 1.24 ms     | 1.42 ms   | +0.18 ms   |
| Overview                       | 16.54 ms    | 17.72 ms  | +1.18 ms   |
| Broad artifact search          | 6.17 ms     | 6.38 ms   | +0.21 ms   |
| Targeted unified search        | 20.61 ms    | 20.07 ms  | -0.54 ms   |
| Transaction updating 100 tasks | 14.04 ms    | 16.66 ms  | +2.62 ms   |

Negative differences are measurement variation, not evidence that encryption accelerates queries. The 100-task transaction was about 19% slower; Overview about 7% slower. Many ordinary warm reads were close because SQLite retains decoded pages in its cache. First reads can have a larger cost: the first Notes call after opening each connection had median times of 112 ms unencrypted and 425 ms encrypted. This is a fresh SQLite-cache measurement, not an OS cold-disk test; startup module loading and database opening were outside that timer, and subsequent workloads shared the connection's evolving cache.

Median process high-water RSS over the database run was 159.6 MiB unencrypted and 162.0 MiB encrypted. This small difference does not establish a meaningful overall server-memory saving from disabling encryption. The development server's compiler and loaded modules are outside these processes.

## File comparison

The updated storage adapter read and wrote identical generated files on the local filesystem. Each cell is a median of three fresh processes, alternating modes. Reads use already prepared files; writes include durable file/directory synchronization. CPU time is the process's user plus system CPU during the operation, not whole-host CPU percentage. Filesystem caches were not flushed, and this does not measure S3 latency.

| File operation | Unencrypted wall / CPU | Encrypted wall / CPU | Additional wall time |
| -------------- | ---------------------- | -------------------- | -------------------- |
| Read 25 MiB    | 252 / 323 ms           | 389 / 627 ms         | 137 ms               |
| Write 25 MiB   | 190 / 226 ms           | 518 / 630 ms         | 328 ms               |
| Read 100 MiB   | 704 / 850 ms           | 1,642 / 2,043 ms     | 938 ms               |
| Write 100 MiB  | 609 / 500 ms           | 1,727 / 1,854 ms     | 1,118 ms             |

Large file operations have a material penalty, including cipher setup, authenticated chunks, extra buffers and storage I/O. These adapter-level measurements do not isolate cryptographic instructions alone. Encrypted read RSS was not higher in this run: 140 versus 144 MiB for 25 MiB and 246 versus 258 MiB for 100 MiB. Encrypted writes peaked at 167 versus 122 MiB for 25 MiB and 363 versus 196 MiB for 100 MiB. A write currently builds the ciphertext before storing it. The standard file format adds a 28-byte header and a 16-byte authentication tag per 64 KiB chunk, approximately 0.0245% space for these large files.

The upload default remains 25 MiB; 100 MiB is the supported maximum configurable limit and was tested only with synthetic storage fixtures. Neither upload limits nor the live encryption mode were changed by the benchmark.

## Avoidable memory removed

The old encrypted read path held a whole ciphertext buffer, individual decrypted chunks and a concatenated plaintext result. It also copied input in the header/parser and cloned the complete plaintext into the extraction worker. The updated path reads ciphertext in batches of at most 1 MiB for the standard format, writes decrypted chunks into one owned result and transfers that result to the worker. It retains authentication, object binding, final-chunk verification, durable jobs, retry fences and the two-slot processing limit.

Separate before/after measurements compared commit `4d6e543` with the updated implementation. Each case ran in three fresh processes using identical encrypted fixtures and the actual bounded text extraction worker. The following are median process high-water RSS values, including the Node runtime and worker, rather than the live service's cgroup memory:

| Workload                  | Before RSS | Updated RSS | Reduction |
| ------------------------- | ---------- | ----------- | --------- |
| Read one 25 MiB file      | 196 MiB    | 141 MiB     | 28%       |
| Read two 25 MiB files     | 231 MiB    | 182 MiB     | 21%       |
| Process one 25 MiB file   | 224 MiB    | 154 MiB     | 31%       |
| Process two 25 MiB files  | 319 MiB    | 212 MiB     | 33%       |
| Read one 100 MiB file     | 430 MiB    | 260 MiB     | 40%       |
| Read two 100 MiB files    | 536 MiB    | 360 MiB     | 33%       |
| Process one 100 MiB file  | 640 MiB    | 253 MiB     | 60%       |
| Process two 100 MiB files | 747 MiB    | 385 MiB     | 48%       |

Processing two 25 MiB files took median times of 1,029 ms before and 804 ms after; two 100 MiB files took 2,840 and 2,504 ms. Individual timing variation remains visible: a single 100 MiB read was slower after in this small sample. These measurements support lower processing peaks, not a claim of lower idle RAM or a long-duration leak audit.

Legacy single-message files remain readable. Large legacy files convert asynchronously while reader buffers have independent ownership, so worker transfer cannot detach migration data. S3 servers that ignore Range require one full-object response; it is reused rather than downloaded again for every batch, and remains authenticated in encrypted mode. Those servers cannot provide the same bounded ciphertext-read memory as compliant range storage.

## Reproduction and validation

Run `node --import tsx scripts/benchmark-encryption.ts run /absolute/new/private-directory` using Node.js 24. It requires a new directory, creates only synthetic fixtures, alternates both modes, and saves its raw measurements in an owner-only `results.json`. It never starts another server or modifies an existing installation. Raw generated databases, files, keys, sessions and captures belong outside Git. Host contention, storage caches and virtualization affect results; benchmark representative production hardware before treating these figures as capacity limits.

Regression coverage exercises first-start default/opt-out, conflicting and malformed modes, concurrent startup, restart persistence, plaintext database/file behavior, encrypted auth secrets/backups, restore mode preservation, existing encrypted/legacy upgrades, wrong and missing keys, tampering/truncation/swapped objects, transfer ownership during legacy conversion, bounded S3 range reads and range-ignoring S3 compatibility. Type checking, lint, formatting, branding, all 116 automated tests and the production build passed. The plaintext first-start integration test checks owner setup, sign-in, blocked extra-owner creation, authorization, no-store downloads and durable extraction. S3 coverage also includes empty unencrypted objects that reject byte-range requests with HTTP 416. The empty encrypted-object regression also verifies final-tag and object-identity authentication.

Live browser checks waited for each section's successful data response, then inspected seven sections at 1440px/light and 390px/dark without JavaScript errors or horizontal overflow. Two simultaneous 25 MiB uploads on the existing dev instance completed extraction, produced two SSE completion events, remained searchable and downloaded with matching hashes and valid cross-chunk ranges. Anonymous file requests returned 401. Both temporary items were permanently removed through their revision-checked Trash actions.

During that 11.8-second upload/processing/download window, sampled service-cgroup memory peaked at 1,603 MiB (1.56 GiB), and CPU reached 300% of one core, or 75% of this four-core host. This includes transfer and development-server work; it is not a browsing or idle measurement, and has no equivalent before sample. A subsequent 30-second settled window had median whole-host CPU of 0.032%, average 0.268% and peak 1.87%, with service memory around 1,201 MiB (1.17 GiB). Cgroup memory includes file cache. These short windows are not a long-duration leak test or proof that idle RAM improved because of the buffer changes.

Fixture verification retained all 5,000 entries per section and all 500 processed file fixtures. Encrypted SQLite integrity, exactly one owner, account/key/auth-secret continuity and the saved encrypted mode passed on the running dev installation. Full-instance backups taken before and after the change restored and verified with the updated CLI, including the older manifest without an encryption-mode field. The temporary audit session was revoked and its next private API request returned 401.

The earlier CPU results remain in [single-user-performance-audit.md](single-user-performance-audit.md). Removing encryption does not remove compilation, OCR, application query work or idle timers. The measured warm database costs are much smaller than the earlier waste from eager section loads and unused artifact search excerpts; large file processing is where the encryption option has a clearer tradeoff.
