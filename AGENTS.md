# Cilo repository guidance

These instructions apply throughout this repository. Read any more specific `AGENTS.md` or `AGENTS.override.md` before changing files in its directory. Current user instructions take precedence over repository defaults.

## Orientation and sources of truth

Cilo is a single-owner, self-hosted note-taking web app. Its stack is Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS v4, BlockNote, SQLite, Drizzle, Better Auth, and Excalidraw.

- `PRODUCT.md`: product scope and confirmed user requirements.
- `DESIGN.md`: interface direction, tokens, and responsive behavior.
- `package.json` and `package-lock.json`: executable commands and dependency versions.
- `src/app/`: routes, metadata, and application styles.
- `src/components/`: onboarding, workspace, editor, drawings, and settings; `ui/` contains shadcn components.
- `src/lib/server/`: authentication, schema, persistence, storage, and validation.
- `migrations/`: ordered SQL migrations, including FTS5 and the single-owner invariant.
- `tests/`: automated behavior and persistence checks.
- `docs/`: architecture and self-hosting references; `README.md` contains the quick start.

Inspect the relevant implementation and `git status --short` before making changes. Treat code and executed checks as evidence of current behavior; product plans are not proof that a feature works.

## Development commands

Use npm and Node.js 24. Keep `package-lock.json` committed.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run dev` uses port 3000, or the next free port. To choose a port, use `npm run dev -- --port 3001`. Persistent development data defaults to `data/`; tests must use a separate temporary directory.

Docker delivery uses `docker compose up -d --build`. Inspect configuration with `docker compose config`; check readiness with `/api/cilo/health`. Never remove an existing data volume to resolve a startup issue.

## Engineering rules

- Keep changes scoped to the request. Preserve user edits and unrelated working-tree changes; do not reset, clean, or overwrite them.
- Use TypeScript with explicit boundaries and runtime validation for untrusted input. Keep server modules out of browser bundles.
- SQLite is the only supported database. Use the Drizzle schema for ordinary model access and parameterized SQL for FTS5 and SQLite-specific operations.
- Add an ordered migration for schema changes. Never rewrite a migration that has shipped; verify upgrade behavior on existing data.
- BlockNote JSON is canonical. Markdown export is intentionally lossy; Cilo bundles must preserve document and attachment data.
- Keep revision checks and unsaved edits intact. Never silently resolve a conflict by overwriting the server document.
- Owner creation must remain atomic and single-use. Public signup stays disabled. Authorize every private API and file request on the server.
- Onboarding and ordinary settings belong in the UI. Environment variables configure deployment concerns; secrets are generated and persisted by the server.
- Keep uploads outside public assets behind the storage adapter. Enforce upload limits, generated storage keys, and safe serving of active file formats.
- Keep the interface monochrome and responsive. Reuse existing shadcn controls, with labeled actions, visible focus, accessible dialogs, and explicit loading/error states.
- Bundle app fonts and drawing assets locally. PWA caching must exclude authenticated pages, notes, attachments, and API responses.
- Add dependencies only when necessary for the authorized work. Pin direct versions, update the lockfile, and review compatibility and relevant advisories.
- Keep comments rare: concise single lines that explain a non-obvious reason. Do not narrate the code or add large comment blocks.
- S3, offline editing/sync, collaboration, sharing, and executable artifacts are deferred. Do not present them as implemented.

## Current documentation lookup

Use Context7 for library, framework, SDK, API, CLI, and cloud-service details, including setup, configuration, migration, and library-specific debugging. Do not use it for business logic, ordinary refactoring, or general programming concepts.

1. Resolve the official library name: `npx ctx7@latest library "Library name" "specific documentation question"`.
2. Choose a relevant, reputable result, preferring exact matches and version-specific IDs when available.
3. Fetch one concept at a time: `npx ctx7@latest docs /org/project "specific documentation question"`.

Resolve before fetching unless the user supplied a valid `/org/project` ID. Use at most three commands per question. Never include credentials or private data in queries. Use the permitted network-enabled execution context; do not repeatedly retry DNS failures in a restricted sandbox. On quota failure, report it and suggest `npx ctx7@latest login` or `CONTEXT7_API_KEY`; do not silently substitute remembered API details.

## Verification and review

Run checks appropriate to the change. Application delivery requires type checking, lint, meaningful tests, and a production build. Documentation-only changes require checking paths, commands, and consistency rather than rerunning unrelated application tests.

- Authentication: check onboarding races, blocked signup, login, recovery, and session invalidation.
- Persistence/editor: check saves, delayed requests, conflicting revisions, reloads, and preservation of artifacts.
- Files/import/export: check authorization, limits, traversal, malformed archives, and restoration with attachments.
- UI: inspect desktop and mobile in the browser, including dark mode, keyboard focus, touch controls, and overflow. Use the browser MCP when available.
- Docker/storage: check startup, health, container recreation, migrations, persistent volume permissions, and backup/restore. Use disposable test data.

Review the diff before committing. Flag data loss, missing authorization, extra-owner creation, private-content caching, and lossy bundle restoration as defects. Do not weaken checks to obtain a passing result. Report failed or unavailable checks accurately.

## Documentation and completion

Keep the README short and put detailed references in `docs/`. Update the affected documentation when behavior, configuration, or commands change. Distinguish verified features from deferred work. Do not copy secrets, recovery codes, private notes, test credentials, data directories, or generated screenshots into Git or logs.

Work on a feature branch and deliver application changes through a pull request. Do not push application changes directly to `main`. Create, publish, or merge only within the scope authorized in the conversation; this file grants no additional external-action permission.

Report the resulting behavior, relevant validation, and any remaining limitations. Link the changed files or pull request. Do not claim deployment, publication, or passing tests without evidence.

Reference: [Official AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
