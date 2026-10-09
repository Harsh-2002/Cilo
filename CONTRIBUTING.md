# Contributing

Read [AGENTS.md](AGENTS.md), [product scope](PRODUCT.md), and [design guidance](DESIGN.md). During initial development, the owner may push verified changes directly to `main`. External contributors should open a pull request describing the problem, resulting behavior, and relevant validation.

Use Node.js 24 and `npm ci`. Run the checks in the [testing guide](docs/testing.md). Check desktop and mobile when changing the interface, and Docker persistence when changing storage or packaging. Tests create disposable data outside the repository; never point them at a real installation.

Keep code comments minimal and concise. Preserve the monochrome interface and single-owner model. Do not commit private notes, credentials, generated secrets, recovery codes, or data directories. Put detailed documentation in `docs/`; keep the README focused on getting started.

## Development upgrades

Database migrations run automatically at startup; ordinary updates do not require a manual migration command. Preserve the existing data volume and encryption key, create and verify a backup in **Settings → System**, update the checkout and rebuild. Never delete the data volume to resolve startup issues.

Only older development installations configured through retired storage/backup environment variables need the one-time configuration import: stop Nivra, run `npx tsx scripts/migrate-configuration.ts` with the original data location and key, then restart and verify the imported settings before removing retired variables. This is not part of new installation setup or routine updates. See [recovery procedures](docs/architecture.md#backup-and-recovery-commands).

## HTTP API

The versioned content API is at `/api/v1`; readiness is at `/health`. The [OpenAPI contract](docs/openapi.json) is maintained in this repository and is not served by the instance. Browser sessions and bearer API keys use the same content services as MCP. Create a Read or Read & write key in **Settings → MCP**; OAuth stays at `/mcp`.

```sh
curl -H 'Authorization: Bearer YOUR_API_KEY' 'http://localhost:3000/api/v1/notes?limit=20'
curl -H 'Authorization: Bearer YOUR_API_KEY' 'http://localhost:3000/api/v1/counts'
curl -H 'Authorization: Bearer YOUR_API_KEY' 'http://localhost:3000/api/v1/search?q=meeting&limit=20'
curl -X POST -H 'Authorization: Bearer YOUR_API_KEY' -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: create-note-001' -d '{"title":"Meeting"}' 'http://localhost:3000/api/v1/notes'
```

Lists return `items` and `next`; pass the cursor as `after` with the same filters. Changes to items with revisions require the current `revision`. Content deletion moves items to Trash; restoring or permanently deleting requires the owner session. File and publication responses include canonical URLs. Queued processing returns `jobs` with IDs, status and lookup URLs. The web app listens to `/api/v1/completions` for session-authenticated SSE invalidations, then reloads affected content. JSON creation retries can use `Idempotency-Key`; multipart uploads and bundle transfers do not support that header. The retired `/api/nivra` routes have no aliases.
