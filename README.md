# Nivra

Your personal space for thoughts, plans, and everything worth keeping. Nivra is a minimal, self-hosted notes, tasks, bookmarks and artifacts app with rich text, Markdown import/export, tags, search, drawings and attachments. [Artifacts](docs/artifacts.md) saves pasted text, screenshots, documents and media with local OCR and document search.

## Docker quick start

```sh
git clone https://github.com/Harsh-2002/Nivra.git
cd Nivra
docker compose up -d --build
```

Open <http://localhost:3000> and create your owner account in the browser. Save the recovery code. Account and appearance settings live in the UI; upload limits and local/S3 storage use environment variables.

By default, Docker persists the database, files, generated authentication secret, and encryption key in the `nivra-data` volume. For another port, use `NIVRA_PORT=3001 docker compose up -d`. For remote access, configure the public URL and use an HTTPS reverse proxy. See [self-hosting](docs/self-hosting.md).

Nivra encrypts its database and stored files at rest by default. New installations can opt out before first startup; authentication secrets and backups remain encrypted. See [key custody and encrypted backups](docs/self-hosting.md#encryption-and-key-custody) before moving or restoring an instance.

Existing installations keep their database, keys and encrypted object formats. `NIVRA_*` is the configuration namespace. Upgrade handling preserves existing encrypted data and saved links. See [upgrade compatibility](docs/self-hosting.md#rename-compatibility).

## Development

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

For development from another device, allow the host IP so Next.js hot reload can connect:

```sh
NIVRA_DEV_ORIGINS=dev.example.com npm run dev -- --hostname 0.0.0.0 --port 3001
```

Replace the example hostname with your development host. `NIVRA_DEV_ORIGINS` accepts comma-separated hostnames or IPs without schemes or ports; restart the dev server after changing it.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Next.js · TypeScript · shadcn/ui · Tailwind CSS v4 · BlockNote · SQLite/FTS5 · Drizzle · Better Auth · Excalidraw.

Notes require a connection in this release. MinIO/RustFS-compatible S3 storage is optional. Bookmark preview cards, collections, batch import, and read-only publishing are available. [Overview, global search, version history, connected notes, recurring tasks and Journal](docs/connected-workspace.md) are included. Encrypted instance backups run daily by default and can target local storage or the shared S3-compatible storage. Offline editing and collaboration are deferred. See [architecture](docs/architecture.md), [self-hosting and backups](docs/self-hosting.md), and [contributing](CONTRIBUTING.md).

The [performance and verification guide](docs/performance.md) lists executed checks, corrected defects, and remaining browser/device coverage.

MIT licensed. Bundled dependencies retain their own licenses; see [third-party notices](docs/third-party.md).
