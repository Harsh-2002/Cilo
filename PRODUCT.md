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

Docker starts the app. First-run onboarding, account creation, appearance, and preferences happen in the UI. Local persistent storage is the default. Mobile clients use an installable PWA.

## Capabilities and Constraints

A default Overview with a live local date/time, open tasks, recent notes and bookmarks, quick creation and inline task completion; flat notes, dedicated bookmarks with URL metadata cards, cached thumbnails/icons, collections, favorites, indexed and typo-tolerant search, editing, deletion and preview retry; dedicated tasks with creation/editing/completion/reopening/search, optional dates and daily/weekly/monthly recurrence, quick capture of notes/tasks/links without changing sections, unified search across notes/tasks/bookmarks/artifacts with matching-passage highlights and relevant-block navigation, note checkpoints and restoration, stable internal links and backlinks, optional task/bookmark note associations, daily Journal notes that start blank, separate from Notes, tags, favorites, a shared Trash for deleted notes, journal entries, tasks, bookmarks and artifacts with restoration and confirmed permanent deletion, search, rich editing with per-note Standard/Wide width modes, Mermaid, Excalidraw, images, attachments, Markdown import/export, lossless Nivra bundles. One owner with username/password and recovery code. Mandatory server-side encryption at rest for SQLite, stored attachments, published-file copies, and the authentication secret; an automatically generated key supports simple self-hosting, with external key configuration for separated backups. Online notes in v1, batch Markdown/file/folder import, revocable public read-only snapshots that preserve their published revision and are served in a minimal reader, and environment-only local/S3-compatible file storage. Automatic encrypted full-instance backups to local or independent S3 storage, retention, manual backup/verification, and server CLI recovery into an empty local directory. Offline editing, collaboration, and shared workspaces are deferred.

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

A private shelf for pasted text, screenshots, documents and media. Upload, paste or drop without mandatory folders or tags. Uploaded files use durable background jobs for local English OCR and bounded document extraction. Bookmark previews also load in the background; completion updates refresh the workspace through an authenticated SSE stream. Originals, thumbnails and extracted text remain encrypted locally or in configured compatible storage. Unsupported formats remain downloadable and searchable by name; media is not transcribed.

## Next iteration

Browser-extension capture remains proposed. Bookmarks and tasks are separate implemented sections, backed by SQLite and included in lossless bundles and encrypted instance backups. Task reminders, offline editing, and collaboration remain deferred.
