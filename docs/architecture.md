# Architecture

Cilo has a Next.js application shell, client-only BlockNote/Excalidraw editors, and authenticated Node.js route handlers. SQLite is the only database. Drizzle defines the schema and handles model/auth mapping; prepared SQL handles FTS5, transactional updates, and ordered startup migrations.

## Data and saves

Notes store a versioned BlockNote JSON document. Plain text derived from the blocks feeds FTS5. Every update includes an expected revision; a mismatch returns HTTP 409. The editor serializes saves and preserves newer local edits while a request is in flight. A failed request keeps edits in memory and warns before page unload. This release does not store offline drafts.

Canvas blocks store scene JSON and refer to local attachments for their embedded images and preview. Markdown exports contain portable text, Mermaid fences, local attachments, and drawing sidecars; some rich formatting is simplified. Versioned Cilo bundles preserve document JSON and files, import as new notes, and remap attachment identifiers.

## Accounts and access

The browser onboarding wizard creates one owner with a username and password. A SQLite trigger and setup transaction enforce the single-owner invariant. Better Auth manages password hashes, sessions, and username login; a generated internal `cilo.invalid` address satisfies its account model without requiring mail infrastructure. Public signup is disabled.

A one-use recovery code is hashed in the database. Recovery changes the credential password, revokes all sessions, and replaces the code in one transaction. Generating a replacement while signed in requires the current password. Recovery and setup have bounded attempt limits.

## Files and runtime

The data directory contains `cilo.sqlite`, SQLite WAL files, `auth.secret`, and `uploads/`. Attachments have generated identifiers and are served only through authenticated routes. Raster image types are detected from their signatures; other types download as binary files. The local storage adapter is the extension boundary for future S3-compatible storage.

The PWA caches public static assets and an offline explanation. Notes, API responses, and attachments are network-only. Fonts and drawing assets are bundled with the application.

## Deferred work

S3-compatible storage, IndexedDB offline editing and synchronization, Yjs collaboration, shared workspaces, public sharing, and executable HTML/React previews are not available in this release.

## Dependency maintenance

Direct dependency versions and the lockfile are pinned. `npm audit --omit=dev` currently reports no advisories. The development lint toolchain has an unresolved `braces` denial-of-service advisory inherited through `eslint-config-next` and `fast-glob`; npm's proposed fix downgrades the Next.js lint configuration across major versions. Do not apply that downgrade blindly. Keep lint inputs limited to trusted project files and revisit when an upstream compatible fix ships.

The viewport and single scrolling wrapper follow [BlockNote's mobile keyboard guidance](https://www.blocknotejs.org/docs/react/components/formatting-toolbar#browser-limitations). The workspace inherits the visual viewport height so the editing area remains above the keyboard.
