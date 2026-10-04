# Architecture

Cilo has a Next.js application shell, client-only BlockNote/Excalidraw editors, and authenticated Node.js route handlers. SQLite is the only database. Drizzle defines the schema and handles model/auth mapping; prepared SQL handles FTS5, transactional updates, and ordered startup migrations.

## Data and saves

Notes store a versioned BlockNote JSON document. Plain text derived from the blocks feeds FTS5. Every update includes an expected revision; a mismatch returns HTTP 409. The editor serializes saves and preserves newer local edits while a request is in flight. A failed request keeps edits in memory and warns before page unload. This release does not store offline drafts.

Canvas blocks store scene JSON and refer to local attachments for their embedded images and preview. Markdown exports contain portable text, Mermaid fences, local attachments, and drawing sidecars; some rich formatting is simplified. Versioned Cilo bundles preserve document JSON and files, import as new notes, and remap attachment identifiers.

## Accounts and access

The browser onboarding wizard creates one owner with a username and password. A SQLite trigger and setup transaction enforce the single-owner invariant. Better Auth manages password hashes, sessions, and username login; a generated internal `cilo.invalid` address satisfies its account model without requiring mail infrastructure. Public signup is disabled.

A one-use recovery code is hashed in the database. Recovery changes the credential password, revokes all sessions, and replaces the code in one transaction. Generating a replacement while signed in requires the current password. Recovery and setup have bounded attempt limits.

## Files and runtime

The data directory contains `cilo.sqlite`, SQLite WAL files, `auth.secret`, and `uploads/`. Attachments have generated identifiers and are served only through authenticated routes. Raster image types are detected from their signatures; other types download as binary files. The storage adapter supports local files or an environment-configured S3-compatible bucket. The modular AWS SDK signs object reads, writes, and deletes; credentials remain server-only. SQLite stays local with either file backend.

The PWA caches public static assets and an offline explanation. Notes, API responses, and attachments are network-only. Fonts and drawing assets are bundled with the application.

## Deferred work

IndexedDB offline editing and synchronization, Yjs collaboration, shared workspaces, and executable HTML/React previews are not available in this release.

## Dependency maintenance

Direct dependency versions and the lockfile are pinned. `npm audit --omit=dev` currently reports no advisories. The development lint toolchain has an unresolved `braces` denial-of-service advisory inherited through `eslint-config-next` and `fast-glob`; npm's proposed fix downgrades the Next.js lint configuration across major versions. Do not apply that downgrade blindly. Keep lint inputs limited to trusted project files and revisit when an upstream compatible fix ships.

The viewport and single scrolling wrapper follow [BlockNote's mobile keyboard guidance](https://www.blocknotejs.org/docs/react/components/formatting-toolbar#browser-limitations). The workspace inherits the visual viewport height so the editing area remains above the keyboard.

## Publication snapshots

An ordered migration adds publications and publication files. Publishing checks the expected note revision, copies only referenced note-owned attachments, rewrites their URLs to token-scoped public endpoints, and commits the snapshot and file records together. Private drawing scene data is omitted; readers see its preview. Public APIs return no owner, private note IDs, tags, or draft revisions. Later private edits do not change a publication. Updates preserve its link; revocation deletes the publication and its copies, and a subsequent publication gets a new token. Trashing a note revokes it. Public pages and files are network-only with no persistent service-worker caching.

## Search and tags

FTS5 covers note titles, prose, code, and drawing text, with prefix matching and relevance ordering. If the normal query finds no notes, a vocabulary-based fallback finds close spellings (one edit for words of at least four characters, two for words of at least eight, including adjacent transpositions). Short words and exact matches retain their normal behavior. Up to eight terms participate in typo correction. Favorites, tag, and trash filters apply to both paths. This does not extract text from PDFs, images, or videos.

Tags have a validated named color, defaulting to gray for existing data. Bundles retain colors for newly imported tags; a same-named existing tag keeps its local color. Tag colors are content metadata, while the interface remains monochrome.

Better Auth's TOTP plugin stores encrypted secrets and backup-code data in SQLite. Enrollment must be verified before activation. Password-only sign-in has no private-note session when MFA is enabled. Single-use account recovery also clears MFA and outstanding verification challenges.

## Tasks

Tasks use a dedicated SQLite table and Drizzle queries scoped to the authenticated owner. Create, update, complete, reopen, and delete requests require the owner session and same-origin writes. Updates and deletion use revision checks. Tasks are separate from BlockNote checklist blocks and participate in lossless bundle export/import.

## Mandatory encryption at rest

The better-sqlite3 import is pinned to the SQLite3 Multiple Ciphers fork through an npm alias, preserving the Drizzle driver API. SQLite pages and WAL are encrypted with ChaCha20-Poly1305; temporary SQL storage stays in memory. A random 256-bit master key derives separate SQLite and file keys with HKDF-SHA256. Stored files and the authentication secret use AES-256-GCM with random nonces and authenticated object identifiers. Local and S3 adapters encrypt before writing and authenticate before returning plaintext.

Startup upgrades legacy databases, records pending attachment/publication keys, encrypts legacy objects with atomic local replacement or S3 object replacement, and clears each pending row only after replacement. The migration resumes after interruption. Missing keys, incorrect keys, and authentication failures do not fall back to plaintext. Master-key configuration has no encryption-disable switch.
