# Architecture

Nivra has a Next.js application shell, client-only BlockNote/Excalidraw editors, and authenticated Node.js route handlers. Workspace sections have direct URLs: `/overview`, `/notes`, `/favorites`, `/journal`, `/tasks`, `/bookmarks`, `/artifacts` and `/trash`. The root opens Overview. Client navigation updates browser history while retaining the workspace shell; direct loads and refreshes select the section from the path. Existing `?note=` links retain their behavior, and navigation preserves the editor save guard. Unknown section paths return 404. Authentication and private API authorization apply on every section. PWA navigation remains network-only.

SQLite is the only database. Drizzle defines the schema and handles model/auth mapping; prepared SQL handles FTS5, transactional updates, and ordered startup migrations. Each connection targets a 32 MiB SQLite page cache to avoid repeatedly decrypting pages during larger searches. This is a cache target, not a process memory limit.

## Data and saves

Notes store a versioned BlockNote JSON document. Plain text derived from the blocks feeds FTS5. Every update includes an expected revision; a mismatch returns HTTP 409. The editor serializes saves and preserves newer local edits while a request is in flight. A failed request keeps edits in memory and warns before page unload. This release does not store offline drafts.

Canvas blocks store scene JSON and refer to local attachments for their embedded images and preview. Markdown exports contain portable text, Mermaid fences, local attachments, and drawing sidecars; some rich formatting is simplified. Versioned Nivra bundles preserve document JSON and files, import as new notes, and remap attachment identifiers.

## Accounts and access

The browser onboarding wizard creates one owner with a username and password. A SQLite trigger and setup transaction enforce the single-owner invariant. Better Auth manages password hashes, sessions, and username login; a generated internal `nivra.invalid` address satisfies its account model without requiring mail infrastructure. Public signup is disabled.

A one-use recovery code is hashed in the database. Recovery changes the credential password, revokes all sessions, and replaces the code in one transaction. Generating a replacement while signed in requires the current password. Recovery and setup have bounded attempt limits.

## Files and runtime

The data directory contains `nivra.sqlite`, SQLite WAL files, `auth.secret`, and `uploads/`. Attachments have generated identifiers and are served only through authenticated routes. Raster image types are detected from their signatures. An allowlist of raster and audio/video types is served inline; active formats and unrecognized types download as binary files. Private and token-scoped published attachments support single byte ranges for media seeking, with no-store caching, sandboxed responses, and nosniff headers. By default, stored files are encrypted in independently authenticated chunks, so a range request reads, authenticates and decrypts only the chunks it covers, and larger responses are streamed a megabyte at a time. Encrypted reads allocate one owned plaintext result and read ciphertext in batches of at most 1 MiB for the standard chunk format. Artifact workers receive that buffer through an ownership transfer rather than a cloned file. Legacy migration retains a separate reader buffer, preventing worker transfer from detaching migration data. S3 servers that ignore Range require a full-object response; that response is reused instead of downloaded once per batch. The storage adapter supports local files or an environment-configured S3-compatible bucket. The modular AWS SDK signs object reads, writes, and deletes; credentials remain server-only. SQLite stays local with either file backend.

The PWA caches public static assets and an offline explanation. Notes, API responses, and attachments are network-only. Fonts and drawing assets are bundled with the application.

## Deferred work

IndexedDB offline editing and synchronization, Yjs collaboration, shared workspaces, and executable HTML/React previews are not available in this release.

## Dependency maintenance

Direct dependency versions and the lockfile are pinned. `npm audit --omit=dev` currently reports no advisories. The development lint toolchain has an unresolved `braces` denial-of-service advisory inherited through `eslint-config-next` and `fast-glob`; npm's proposed fix downgrades the Next.js lint configuration across major versions. Do not apply that downgrade blindly. Keep lint inputs limited to trusted project files and revisit when an upstream compatible fix ships.

The viewport and single scrolling wrapper follow [BlockNote's mobile keyboard guidance](https://www.blocknotejs.org/docs/react/components/formatting-toolbar#browser-limitations). The workspace inherits the visual viewport height so the editing area remains above the keyboard.

## Publication snapshots

An ordered migration adds publications and publication files. Publishing checks the expected note revision, copies only referenced note-owned attachments, rewrites their URLs to token-scoped public endpoints, and commits the snapshot and file records together. Private drawing scene data is omitted; readers see its preview. Public APIs return no owner, private note IDs, tags, or draft revisions. Later private edits do not change a publication. Updates preserve its link; revocation deletes the publication and its copies, and a subsequent publication gets a new token. Trashing a note revokes it. Public pages and files are network-only with no persistent service-worker caching.

## Overview

The default Overview reads an authenticated, owner-filtered snapshot from `GET /api/nivra/overview?date=YYYY-MM-DD`. The supplied date is validated and comes from the browser’s local calendar, so due-today and overdue counts follow the owner’s device rather than the server timezone. Drizzle queries inside one SQLite read transaction count all open tasks and return bounded lists of twenty tasks, twenty recently edited active notes, and twenty recent bookmarks. Templates and trashed notes are excluded; document bodies and attachment data are not included.

The client refreshes on mount, shared completion/resync events, window focus and inline task completion. The shared stream reconciles when disconnected; hidden tabs close the stream and suspend the minute-aligned local clock timer. Unmount aborts outstanding snapshot requests. Task mutations use existing expected-revision checks and recurrence transactions. Overview reuses guarded workspace navigation and existing creation flows; it introduces no database tables, persistent preferences, event stream, or dependencies.

## Search and tags

FTS5 covers note titles, prose, code, and drawing text, with prefix matching and relevance ordering. If the normal query finds no notes, a vocabulary-based fallback finds close spellings (one edit for words of at least four characters, two for words of at least eight, including adjacent transpositions). Short words and exact matches retain their normal behavior. Up to eight terms participate in typo correction. Favorites, tag, and trash filters apply to both paths. Artifacts provide bounded document extraction and local English image OCR; media transcription remains deferred.

Tags cover notes, journal entries, tasks, bookmarks and artifacts through indexed join tables. Migration 0017 preserves note relationships and adds the other item types. Owner-authorized tag saves use revision checks; Trash retains relationships and permanent deletion cascades them. Recurring successors inherit task tags. Tags have a validated named color, defaulting to gray for existing data. Bundles retain colors for newly imported tags; a same-named existing tag keeps its local color. Tag colors are content metadata, while the interface remains monochrome.

Better Auth's passkey plugin supports optional discoverable FIDO2 credentials, including security keys, device authenticators and password managers. Registration and login require server-verified PIN or biometric verification. The canonical public URL supplies the relying-party ID and origin. Adding, renaming and removing keys require a session created within five minutes. Verified passkey login is sufficient when TOTP is enabled; password login still requires TOTP. Account recovery preserves registered passkeys and revokes sessions; unwanted credentials must be removed explicitly. Passkey records are included in full-instance encrypted backups.

Better Auth's TOTP plugin stores encrypted secrets and backup-code data in SQLite. Enrollment must be verified before activation. Password-only sign-in has no private-note session when MFA is enabled. Single-use account recovery also clears MFA and outstanding verification challenges.

## Tasks

Tasks use a dedicated SQLite table and Drizzle queries scoped to the authenticated owner. Create, update, complete, reopen, and delete requests require the owner session and same-origin writes. Updates and deletion use revision checks. Tasks are separate from BlockNote checklist blocks and participate in lossless bundle export/import.

## Default-on encryption at rest

The better-sqlite3 import is pinned to the SQLite3 Multiple Ciphers fork through an npm alias, preserving the Drizzle driver API. SQLite pages and WAL are encrypted with ChaCha20-Poly1305; temporary SQL storage stays in memory. A random 256-bit master key derives separate SQLite and file keys with HKDF-SHA256. The authentication secret, backup manifests and backup objects use one AES-256-GCM message with a random nonce and an authenticated object identifier (the single-message v1 format). Attachments and other stored files use the chunked v2 format. Local and S3 adapters encrypt before writing and authenticate before returning plaintext.

Startup upgrades legacy databases, records pending attachment/publication keys, encrypts legacy objects with atomic local replacement or S3 object replacement, and clears each pending row only after replacement. The migration resumes after interruption. Missing keys, incorrect keys, and authentication failures do not fall back to plaintext. A fresh installation can choose `NIVRA_ENCRYPTION_ENABLED=false` before its first startup. The owner-only `encryption-mode.json` record persists the choice; conflicting environment values, malformed records and opt-out attempts on established installations fail. Complete records are atomically published without overwriting a concurrent startup's decision. Existing pre-mode installations default to encryption and retain the resumable migration. The opt-out stores SQLite and file data as plaintext while authentication secrets and backups remain encrypted; it never changes authorization or creates an automatic fallback for failed decryption.

## Bookmarks

Bookmarks use an owner-scoped Drizzle model with expected revisions, unique normalized URLs, collections, favorites, and an independent FTS5 index/vocabulary. Search matches title, description, URL and collection, with prefix, substring and close-spelling fallback. URL saves fetch Open Graph/Twitter/HTML metadata; unavailable metadata leaves a saved fallback link. Editing is independent of fetching, and preview refresh preserves existing data on fetch failure. Lossless bundles include bookmark details and cached preview assets; importing skips existing URLs.

The metadata fetcher validates HTTP(S), rejects credentials and nonstandard ports, resolves and validates every DNS address, and pins the chosen address for the connection. Redirects and image fetches repeat this check. Private, loopback, reserved, mapped and transition addresses are blocked. A shared ten-second deadline, three-redirect limit, 1 MiB HTML limit and 2 MiB image limit bound requests. Script execution and headless browsing are not used. Cached raster previews use generated storage IDs and the installation's saved encryption mode; the browser only requests owner-authorized Nivra image routes. Unsupported image formats use a fallback rather than rendering active source content.

## Encrypted recovery backups

Local storage is the default; hybrid storage puts files in ordinary S3-compatible objects while SQLite remains local. Backups have an independent local/S3 destination, interval and retention policy. The default is a local backup every 24 hours with seven completed copies. The single-instance scheduler checks due work each minute and does not run during production builds. Manual backups use the same implementation. A filesystem lease coordinates CLI and server creation; process-local file pins defer deletions while a snapshot is being copied.

`VACUUM INTO` produces a consistent database snapshot in the installation's persisted mode, which is reopened with the appropriate key or plaintext configuration and checked. Its referenced-file inventory includes attachments, publication files, bookmark thumbnails and icons. Database, encrypted authentication secret, individual file contents and manifest are sealed separately with backup/object-bound AES-GCM. The authenticated manifest records the storage encryption mode and is the final completion marker. Failed copies lack a committed manifest; retention removes the marker first and deletes only backup-owned object names. Abandoned sets older than 24 hours are cleaned after a successful backup. Backup metadata/status is encrypted locally; API responses exclude credentials and filesystem paths.

Restore authenticates the manifest and each object, checks lengths and SHA-256 hashes, verifies SQLite/foreign-key/FTS integrity and the exact file inventory, and materializes a local installation in the backed-up encryption mode in a private staging directory. Older manifests without a mode field mean encrypted storage. Only a new or empty destination can receive it, after full verification. The original key must be supplied independently; backup objects never contain it. A successful local restore contains an owner-only copy of that key for the default local setup. This offline CLI operation does not overwrite or switch the running instance. Recovery verification exercises the same restore path in a disposable directory. The production image contains a small bundled Node CLI without a TypeScript runtime or compiler.

Backups read one complete database/file object at a time in memory, not an entire archive; provision RAM for the largest object and disk space for the database snapshot or verification staging. Backup schedules are periodic recovery points, not continuous replication. Run one Nivra process per data directory; horizontal replicas and distributed file-deletion leases are not supported.

## Connected workspace

Migration 0008 adds note checkpoints, stable directed links, template/daily identity, task scheduling, and task FTS5 with triggers and existing-title backfill. Existing notes remain regular notes and existing tasks retain undated, nonrecurring behavior. A partial unique index enforces one daily note per owner/date; the parent-occurrence index prevents duplicate recurring successors.

The authenticated unified-search endpoint parses type/tag filters, applies bounded FTS5 prefix and vocabulary typo matching across the four corpora, and excludes templates and trashed notes. Internal Markdown-compatible links store stable note IDs; saving or restoring a document rebuilds its outgoing edges transactionally. Rename does not invalidate links. Optional task/bookmark foreign keys use SET NULL on permanent note deletion.

Before changing a note's title or document, keep a checkpoint if the previous checkpoint is at least five minutes old. Restore uses a compare-and-swap revision check, forces a checkpoint of current content and rebuilds outgoing links in the same immediate transaction. Keep the newest 100 checkpoints and retain note-owned attachments.

Recurring completion reads the expected revision and creates one successor in the same transaction. Calendar arithmetic preserves a monthly anchor across short months and title-only edits. The browser supplies local calendar dates; no server notification scheduler is involved. Template instantiation copies encrypted attachments before committing the new document and remaps file IDs. Concurrent daily creation converges on the existing unique note and removes losing copies.

Lossless bundles now use version two and still accept version one. Import remaps note/file/task IDs, history documents and internal links, validates recurrence relationships, and preserves conflicting daily content as regular notes. Encrypted full-instance recovery includes the new schema and selected daily-template setting without a separate backup format.

## Reader and application fallbacks

Publishing prepares HTML in a bounded worker before committing the encrypted publication snapshot and its HTML together. The public route reads that prepared HTML through an indexed token lookup, checks the current publication, and disables HTTP caching, so revocation is immediate. Existing snapshots are prepared at startup when missing or when the renderer changes. Reader scripts, styles and the rendering worker are built before development startup or production compilation; visiting a share link does not compile the React reader. The React reader escapes text, validates link and media schemes, and renders paragraphs, lists, tables, code and attachment previews into the initial HTML without loading the editing runtime. Syntax coloring and sanitized Mermaid SVG are lazy client enhancements; source code remains readable without JavaScript. Public pages carry a scoped CSP and expose only the snapshot's referenced token-scoped files. Editing the private original does not change the snapshot until republishing.

Theme initialization runs once in the server-owned document head before paint. The next-themes context still handles appearance changes and system preference updates; its redundant injected script is an inert text data block, avoiding React 19 client-remount warnings.

Unknown application routes and revoked share links return 404 pages. Workspace loading is scoped to its route group so a public missing note does not stream a successful loading response. Route and root error boundaries provide recovery controls without exposing exception details. Their retry action requests the page again rather than reusing a failed server-component response. Migration 0009 removes only the unchanged automatically seeded Journal default. New entries are blank unless a template was explicitly selected.

## Editor controls and shared media

Checklist blocks render with Nivra’s shared shadcn checkbox while preserving BlockNote’s keyboard shortcuts, parsing, canonical JSON, and Markdown checklist conversion. Native checkbox markup in exported HTML is a serialization format, not a visible app control. Existing Mermaid diagrams remain editable and exportable; Diagram is omitted from the creation menu, while Drawing remains available.

Editor and reader audio/video blocks share a client player with styled play/pause, seeking, volume, retry, and video fullscreen controls where the browser supports them. The reader still sends its prose and file links as initial HTML. A no-script link opens each media file when JavaScript is unavailable; interactive playback controls require JavaScript. The player synchronizes already-loaded metadata on attachment, so media loaded before hydration still shows its duration and permits seeking. Public media remains scoped to the published snapshot. Browser codec support determines which media formats can play.

## Paged tasks and bookmarks

`GET /api/nivra/tasks` and `GET /api/nivra/bookmarks` return `{ items, next }` pages of at most 100 rows (default 60) in a stable order; `next` is an opaque cursor for the following page, and `null` marks the end. Tasks accept `filter` (`open`, `completed`, `today`, `upcoming`), `today` (the browser's local date), and `q`; bookmarks accept `q`, `favorite=1`, `collection`, and `unfiled=1`. `?summary=1` returns task open/completed counts or the bookmark total for the same filters plus the owner's collection names. Cursors are validated and rejected with 400 when malformed. Bundle export and import still read the complete sets directly on the server. The API is private to the signed-in owner; scripts that previously read a bare array must follow `next`.

## Chunked file encryption

New files use the chunked v2 format: a 28-byte header (magic, chunk size, random 16-byte salt) followed by 64 KiB plaintext chunks, each sealed with AES-256-GCM and followed by its 16-byte tag. A per-file key is derived with HKDF-SHA256 from the files key and the salt. Each chunk's nonce is its 32-bit index plus a final-chunk flag, and the object identifier is authenticated data on every chunk. Reordering, splicing chunks between objects or files, truncation, appended chunks, a wrong key, and any changed byte are rejected by authentication. Chunk offsets are computed from the stored size, so a range read fetches only the covering bytes: a file read for local storage, or `Range` requests for S3-compatible storage (a server that ignores `Range` and returns the whole object is handled). Plaintext is released only after the chunk containing it has authenticated; a damaged chunk therefore fails the request when that part is read. A response that has already started streaming cannot change its status, so it is aborted instead. Whole-object verification still happens when backups read every file.

Objects written in the earlier single-message v1 format remain readable. Because that format authenticates the whole file at once, such a file is decrypted in full for the request that opens it. When it is at least 1 MiB it is then converted in place to the chunked v2 format: the converted copy is verified against the original plaintext before the atomic replace, one conversion runs at a time, a failure leaves the original untouched, and deleting a file waits for its conversion so it cannot be recreated. Uploads are still read into memory before encryption (up to `NIVRA_UPLOAD_LIMIT_MIB`, at most 100 MiB), as are bundle export/import and the per-object step of backups; those paths are not streamed.

## Section switching

The workspace shows a section's rows only when they belong to that section. Each list records the section (view and tag; filter for tasks; favorites and collection for bookmarks) that its rows were loaded for, so a new heading is never drawn over the previous section's data. A small in-memory cache (`src/lib/section-cache.ts`) keeps the last-known first page, counts and Overview snapshot per section and shows them immediately on revisit while a fresh copy loads in the background; a section with nothing known shows a skeleton sized to its real rows. Only the section being visited loads its data; startup does not prefetch every collection or load hidden note lists. Overview refreshes on entry, focus, visibility, local actions and completion events rather than continuously polling. Its minute clock also refreshes data when the local calendar date changes. The shared SSE client retains its disconnected-stream fallback. The cache is memory-only, cleared on reload, sign-out, whenever the workspace unmounts, and on import, cleared for the affected section when something is captured, and cleared for other sections when a list is edited locally. Nothing is written to browser storage or the service worker, so private content is never cached persistently.

## Private artifact shelf

Migration 0014 adds owner-scoped artifacts and FTS5 indexes. SQLite stores titles, filenames, extracted text, dimensions, extraction state and revisions; originals and thumbnails use the encrypted local/S3 file adapter. Artifact search participates in global full-text and fuzzy search. Uploads preserve originals, while two worker slots claim durable SQLite jobs for bundled English OCR or bounded PDF extraction, recovering expired leases after restart. Text and metadata mutations require the current revision. Private file responses retain authenticated range delivery. Full-instance backups enumerate both original and thumbnail keys and validate artifact search indexes during recovery. Note bundles retain their existing scope. See [artifacts.md](artifacts.md) for supported formats and resource limits.

## Rename compatibility

Configuration and application URLs use `NIVRA_*` and `/api/nivra/`. A small compatibility boundary retains historical wire identifiers as protocol values, accepts previous host configuration aliases and saved URLs, detects an existing database filename and reads older backup/bundle manifests. Current exports identify Nivra. Cryptographic signature bytes and derivation inputs remain fixed so no existing key or object is rewritten during a product rename. Fresh S3 prefixes and Compose volume labels use Nivra; existing deployments must preserve their configured object prefixes and bind the original volume explicitly.

Background artifact extraction and bookmark previews use [durable SQLite jobs and authenticated SSE completion updates](background-processing.md).

## Shared Trash

Migration 0016 adds nullable deletion timestamps to tasks, bookmarks and artifacts without changing existing content or keys. Notes and journal entries retain their existing timestamps. Owner-authorized `/api/nivra/trash` returns a paginated, searchable list across all five item types. Restoration and permanent deletion require the displayed revision. Normal lists, counts, Overview, connections and workspace search exclude deleted items; normal artifact files and bookmark previews return 404 while deleted.

Deletion fences pending artifact/bookmark jobs in the same SQLite transaction. Restoration requeues pending derived work; old leases cannot commit over a restored item. Originals and previews remain encrypted and referenced until permanent deletion. Permanently deleting a recurring task retains its following occurrence and detaches the removed parent identifier, keeping future exports valid. Full-instance backups include deleted records and their files. Portable note bundles preserve task/bookmark deletion state and previews; artifact originals remain within full-instance backups, matching the existing bundle scope. Duplicate bookmark URLs remain reserved while in Trash, so saving the same URL directs the owner to restore it.
