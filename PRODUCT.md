# Cilo

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js, TypeScript, shadcn/ui, Tailwind CSS v4, BlockNote, SQLite, Drizzle, FTS5, Better Auth, Excalidraw, Docker Compose.

## Users

One owner per self-hosted installation, writing personal notes on desktop, tablet, and mobile.

## Product Purpose

A quiet place to write, organize with tags, and preserve notes with rich text, Markdown portability, code, diagrams, drawings, and files.

## Operating Context

Docker starts the app. First-run onboarding, account creation, appearance, and preferences happen in the UI. Local persistent storage is the default. Mobile clients use an installable PWA.

## Capabilities and Constraints

Flat notes, tags, favorites, trash, search, rich editing, Mermaid, Excalidraw, images, attachments, Markdown import/export, lossless Cilo bundles. One owner with username/password and recovery code. Online notes in v1, batch Markdown/file/folder import, revocable public read-only snapshots with reader preview, and environment-only local/S3-compatible file storage. Offline editing, collaboration, and shared workspaces are deferred.

## Brand Commitments

Cilo, inspired by Clio. Minimal black-and-white interface with neutral gray, light/dark/system themes, restrained typography and borders. Syntax and user drawings can contain color.

## Product Principles

- Writing comes first.
- Data belongs to the owner and stays portable.
- Setup and everyday configuration happen in the UI.
- Responsive behavior follows the task, not just viewport size.

## Accessibility & Inclusion

Keyboard-operable controls, visible focus, readable contrast, reduced-motion support, and touch-sized mobile actions.

## Next iteration

Dedicated Tasks and Bookmarks views are proposed next: completion/filtering for tasks and URL cards for bookmarks, using SQLite metadata and the same file adapter. Browser-extension capture follows later. These managers are not implemented in this iteration; checklist blocks and ordinary links already work inside notes.
