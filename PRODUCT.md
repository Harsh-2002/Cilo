# Nivra

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js, TypeScript, shadcn/ui, Tailwind CSS v4, BlockNote, SQLite, Drizzle, FTS5, Better Auth, Excalidraw, Docker Compose.

## Users

One owner per self-hosted installation, saving personal notes, tasks, and bookmarks on desktop, tablet, and mobile.

## Product Purpose

A quiet place to write, organize with tags, and preserve notes with rich text, Markdown portability, code, diagrams, drawings, and files.

## Operating Context

Docker starts the app. First-run onboarding, account creation, appearance, and preferences happen in the UI. Local persistent storage is the default. Mobile clients use an installable PWA with a theme-matched launch screen.

## Capabilities and Constraints

A default Overview with a live local date/time, open tasks, recent notes and bookmarks, quick creation and inline task completion; flat notes, dedicated bookmarks with URL metadata cards, cached thumbnails/icons, collections, favorites, indexed and typo-tolerant search, editing, deletion and preview retry; dedicated tasks with creation/editing/completion/reopening/search, optional dates and daily/weekly/monthly recurrence, quick capture of notes/tasks/links without changing sections, unified search across notes/tasks/bookmarks/artifacts with matching-passage highlights and relevant-block navigation, note checkpoints and restoration, stable internal links and backlinks, optional task/bookmark note associations, daily Journal notes that start blank, separate from Notes, tags, favorites, a shared Trash for deleted notes, journal entries, tasks, bookmarks and artifacts with restoration and confirmed permanent deletion, search, rich editing with per-note Standard/Wide width modes, Mermaid, Excalidraw, images, attachments, Markdown import/export, lossless Nivra bundles. One owner with username/password and recovery code. Default-on server-side encryption at rest for SQLite, stored attachments and published-file copies, with a persisted environment-only opt-out before a new installation's first startup. Authentication secrets and full-instance backups remain encrypted in either mode; an automatically generated key supports simple self-hosting, with external key configuration for separated backups. Online notes in v1, batch Markdown/file/folder import, revocable public read-only snapshots that preserve their published revision and are served in a minimal reader, and environment-only local/S3-compatible file storage. Automatic encrypted full-instance backups to local or shared S3 storage, retention, manual backup/verification, and server CLI recovery into an empty local directory. Offline editing, collaboration, and shared workspaces are deferred.

## Brand Commitments

Nivra: a private personal brain and search engine. Minimal black-and-white interface with neutral gray, light/dark/system themes, restrained typography and borders. Syntax and user drawings can contain color.

## Product Principles

- Writing comes first.
- Data belongs to the owner and stays portable.
- Setup and everyday configuration happen in the UI.
- Responsive behavior follows the task, not just viewport size.

## Accessibility & Inclusion

Keyboard-operable controls, visible focus, readable contrast, reduced-motion support, and touch-sized mobile actions.

## Artifacts

A private shelf for pasted text, screenshots, documents and media. Upload, paste or drop without mandatory folders or tags. Uploaded files use durable background jobs for local English OCR and bounded document extraction. Bookmark previews also load in the background; completion updates refresh the workspace through an authenticated SSE stream. Originals, thumbnails and extracted text use the installation's persisted encryption mode locally or in configured compatible storage. Unsupported formats remain downloadable and searchable by name; media is not transcribed.

Tags organize notes, journal entries, tasks, bookmarks and artifacts together. Selecting a tag shows a searchable, paginated collection of all tagged item types without creation actions. Tags survive Trash and restoration; permanently deleting an item removes its tag relationships. Recurring tasks carry their tags into the next occurrence. Note bundles also preserve task and bookmark tags, and full-instance backups include all tag relationships.

Favorites is a browsing-only card collection of starred notes, journal entries and bookmarks. Creating notes and journal entries belongs in their sections or Quick, rather than Favorites or tag collections.

## Next iteration

Browser-extension capture remains proposed. Bookmarks and tasks are separate implemented sections, backed by SQLite and included in lossless bundles and encrypted instance backups. Task reminders, offline editing, and collaboration remain deferred.

Passkeys are an optional login method alongside passwords and account recovery. They require PIN or biometric verification, support discoverable FIDO2 hardware and password-manager credentials, and have account settings for enrollment, rename and removal. Verified passkeys satisfy login when TOTP is enabled; password login still requires TOTP. Account recovery preserves registered passkeys, while revoking sessions and clearing TOTP.

The owner’s name and login identifier are fixed after onboarding. Login identifiers accept a username or email address without requiring email delivery. Appearance is available in the sidebar; Settings contains Account and Import & export. Artifact cards use background-generated private thumbnails or file-type icons, while extracted content remains in search and the detailed viewer.

First-run setup offers password or verified passkey authentication after choosing the fixed account identity. Password setup supports optional TOTP enrollment. The owner can add the other login method later; recovery remains available for either choice. Show passkey sign-in only when a passkey is registered. Prevent removal of the final usable login method.
