# Cilo

A quiet place to think, write, and remember. Cilo is a minimal, self-hosted note-taking app with rich text, Markdown import/export, tags, search, diagrams, drawings, and attachments.

## Docker quick start

```sh
git clone https://github.com/Harsh-2002/Cilo.git
cd Cilo
docker compose up -d --build
```

Open <http://localhost:3000> and create your owner account in the browser. Save the recovery code. Account and appearance settings live in the UI; upload limits and local/S3 storage use environment variables.

Docker persists the database, files, and generated authentication secret in the `cilo-data` volume. For another port, use `CILO_PORT=3001 docker compose up -d`. For remote access, configure the bind address and public URL, then use an HTTPS reverse proxy. See [self-hosting](docs/self-hosting.md).

## Development

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

For development from another device, allow the host IP so Next.js hot reload can connect:

```sh
CILO_DEV_ORIGINS=10.1.1.5 npm run dev -- --hostname 0.0.0.0 --port 3001
```

Replace the example IP with your host's address. `CILO_DEV_ORIGINS` accepts comma-separated hostnames or IPs without schemes or ports; restart the dev server after changing it.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Next.js · TypeScript · shadcn/ui · Tailwind CSS v4 · BlockNote · SQLite/FTS5 · Drizzle · Better Auth · Excalidraw.

Notes require a connection in this release. MinIO/RustFS-compatible S3 storage is optional. Batch import and read-only publishing are available. Offline editing and collaboration are deferred. See [architecture](docs/architecture.md), [self-hosting and backups](docs/self-hosting.md), and [contributing](CONTRIBUTING.md).

MIT licensed. Bundled dependencies retain their own licenses; see [third-party notices](docs/third-party.md).
