# Nivra

**Your personal brain, on your own server.**

Nivra brings notes, journals, tasks, bookmarks and files into one quiet workspace. Plan with Calendar and Kanban, find things with full-text search, and connect your AI agents through MCP.

![Nivra Overview showing tasks, recent notes and saved links with demo content](docs/images/overview.webp)

- **Write and collect:** rich-text notes, drawings, attachments, bookmarks, tags, favourites and searchable artifacts with background OCR and thumbnails.
- **Plan:** daily journals, task dates, recurring tasks, Kanban boards, calendar events and push reminders.
- **Connect:** MCP at `/mcp`, with API keys or OAuth, read-only or read/write access, and exact counts alongside paginated tools.
- **Keep it yours:** one owner, passkey or password login, optional TOTP, encryption at rest and encrypted backups. Use the browser or install the PWA. Editing requires a connection.

<details>
<summary>See the Kanban board</summary>

![Nivra Kanban board showing To do, In progress and Done columns with demo content](docs/images/kanban.webp)

Screenshots use demo content.

</details>

## Get started with Docker

Requires Docker with Compose. Build and run from this repository:

```sh
git clone https://github.com/Harsh-2002/Nivra.git
cd Nivra
docker compose up -d --build
```

Open **<http://localhost:3000>**, create your owner account and save the recovery code. No environment configuration is required for local use. The included [compose.yaml](compose.yaml) persists your database, files and generated keys in a named volume.

For HTTPS behind a reverse proxy:

```sh
NIVRA_PUBLIC_URL=https://notes.example.com docker compose up -d --build
```

Use `NIVRA_PORT=3001` to publish a different host port. Account, MCP and notification setup live in the UI; appearance is in the sidebar. See [self-hosting](docs/self-hosting.md) for proxy, storage, updates and backup/restore instructions.

## Environment

All settings are optional for the default local installation. Copy [.env.example](.env.example) to `.env` when needed, or set variables in your shell. Keep the data volume and encryption key when upgrading. Choose the encryption mode before a new installation's first startup; it cannot be changed later.

| Variable                     | Default        | Purpose                                                         |
| ---------------------------- | -------------- | --------------------------------------------------------------- |
| `NIVRA_PUBLIC_URL`           | Request origin | Browser-visible HTTPS origin when using a reverse proxy.        |
| `NIVRA_PORT`                 | `3000`         | Host port published by Compose.                                 |
| `NIVRA_UPLOAD_LIMIT_MIB`     | `25`           | Upload limit in MiB; integer from 1 to 100.                     |
| `NIVRA_ENCRYPTION_ENABLED`   | `true`         | Encrypt the database and stored files; first startup only.      |
| `NIVRA_STORAGE_BACKEND`      | `local`        | Store files locally or use `s3`. SQLite stays local.            |
| `NIVRA_S3_ENDPOINT`          | AWS endpoint   | Custom endpoint for S3-compatible storage.                      |
| `NIVRA_S3_BUCKET`            | Unset          | Bucket required for S3 files or backups.                        |
| `NIVRA_S3_ACCESS_KEY_ID`     | Unset          | Access key required for S3.                                     |
| `NIVRA_S3_SECRET_ACCESS_KEY` | Unset          | Secret key required for S3.                                     |
| `NIVRA_S3_BACKUP_ENABLED`    | `false`        | Reuse the S3 connection for backups; otherwise back up locally. |

<details>
<summary>Advanced settings</summary>

| Variable                      | Default                           | Purpose                                                                                           |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NIVRA_DATA_DIR`              | `./data` on host                  | Host-run data directory; Compose uses `/app/data` inside its volume.                              |
| `NIVRA_DATA_VOLUME`           | Compose-managed name              | Override the existing Compose volume name.                                                        |
| `NIVRA_ENCRYPTION_KEY`        | Generated and persisted           | Externally managed 64-character hexadecimal encryption key.                                       |
| `NIVRA_ENCRYPTION_KEY_FILE`   | Data directory's `encryption.key` | External key file containing 32 raw bytes; mount it when using Docker.                            |
| `NIVRA_S3_REGION`             | `us-east-1`                       | S3 region.                                                                                        |
| `NIVRA_S3_PREFIX`             | `nivra/`                          | File object prefix.                                                                               |
| `NIVRA_S3_FORCE_PATH_STYLE`   | `true`                            | Path-style requests for S3-compatible services.                                                   |
| `NIVRA_BACKUP_PREFIX`         | `nivra-backups/`                  | Backup object prefix when using S3.                                                               |
| `NIVRA_BACKUP_DIR`            | Data directory's `backups/`       | Local backup destination; mount a persistent path in Docker.                                      |
| `NIVRA_BACKUP_INTERVAL_HOURS` | `24`                              | Backup interval in hours, greater than 0 and at most 8760.                                        |
| `NIVRA_BACKUP_KEEP`           | `7`                               | Completed backups retained; integer from 1 to 365.                                                |
| `NIVRA_DEV_ORIGINS`           | Unset                             | Development-only hostnames/IPs allowed for hot reload; comma-separated, without schemes or ports. |

Only the current `NIVRA_*` settings are supported. Authentication and push secrets are generated and persisted by the server. See [key custody and recovery](docs/self-hosting.md#encryption-and-key-custody) before moving an installation.

</details>

[Self-hosting](docs/self-hosting.md) · [Workspace guide](docs/connected-workspace.md) · [Artifacts](docs/artifacts.md) · [MCP](docs/mcp.md) · [Architecture](docs/architecture.md) · [Testing](docs/testing.md)

MIT licensed. See [LICENSE](LICENSE) and [third-party notices](docs/third-party.md).

## Development

Requires **Node.js 24** and npm. From a cloned checkout:

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. Install FFmpeg on the host for video thumbnails; Docker includes it. For hot reload behind a domain, set `NIVRA_PUBLIC_URL` and `NIVRA_DEV_ORIGINS` as described in [development hosting](docs/self-hosting.md#development-behind-a-domain).

```sh
npm run typecheck
npm run lint
npm run format:check
npm run verify:branding
npm test
npm run build
```

Next.js · TypeScript · shadcn/ui · Tailwind CSS · BlockNote · SQLite/FTS5 · Drizzle · Better Auth. See [CONTRIBUTING.md](CONTRIBUTING.md) before making changes.
