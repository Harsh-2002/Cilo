# Self-hosting

## Start and onboard

Run `docker compose up -d --build`, then open `http://localhost:3000`. Create your name, username, and password in the onboarding wizard. Passwords require at least 12 characters. Download the recovery code before continuing. No SMTP, manual auth secret, or account environment variables are required.

Complete setup before making a fresh installation available to other people: the first successful setup submission creates its owner. Later signup is disabled. This installation supports exactly one owner.

## Runtime configuration

The production Dockerfile uses separate dependency, build, and runtime stages. The final stage starts from Alpine and includes Node, its runtime libraries, Next.js standalone output, static assets, and migrations. npm, Yarn, TypeScript, compilers, and development source are excluded. SQLite is compiled or installed for the same platform as the runtime. Run development directly with `npm ci` and `npm run dev` for hot reload.

| Variable            | Default                                 | Purpose                                                                                                |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CILO_PORT`         | `3000`                                  | Host port published by Compose                                                                         |
| `CILO_BIND_ADDRESS` | `127.0.0.1`                             | Host interface published by Compose                                                                    |
| `CILO_PUBLIC_URL`   | Browser request origin                  | Canonical origin, e.g. `https://notes.example.com`, for reverse-proxy authentication and origin checks |
| `CILO_DATA_DIR`     | `./data` locally; `/app/data` in Docker | Database, secret, and uploads                                                                          |

Set variables in the shell or copy `.env.example` to `.env`. Appearance and upload limits belong in UI settings. Authentication secrets are generated on first boot and preserved in the data directory.

For LAN access, publish to a suitable interface. For mobile installation and remote access, serve HTTPS through your reverse proxy, preserve the request host, and set `CILO_PUBLIC_URL` to the browser-visible origin. Keep the app at the domain root; subpath hosting is not supported. The app container runs as the Node user, UID 1000. A custom bind-mounted data directory must be writable by that user.

```sh
CILO_BIND_ADDRESS=0.0.0.0 CILO_PUBLIC_URL=https://notes.example.com docker compose up -d --build
docker compose ps
docker compose logs --tail=100 cilo
```

## Upgrade

Back up first, update the checkout, then run `docker compose up -d --build`. Ordered migrations run before requests are served. A migration or storage-permission failure prevents startup rather than running with a partial schema. Keep the data volume when recreating containers.

## Full instance backup and restore

Stop Cilo before copying data so SQLite, attachments, and the authentication secret represent the same point in time. Do not copy only `cilo.sqlite` while WAL writes are active. A UI Cilo export contains notes and files; it does not contain credentials, sessions, or instance secrets.

For the default Compose project name `cilo`, the volume is `cilo_cilo-data`; confirm the name with `docker volume ls` if you changed the project name. Use a backup directory outside the repository.

```sh
mkdir -p ../cilo-backups
docker compose stop cilo
docker run --rm --user 0 -v cilo_cilo-data:/data:ro -v "$PWD/../cilo-backups:/backup" --entrypoint tar cilo:local -czf /backup/cilo-backup.tar.gz -C /data .
docker compose start cilo
```

To restore into an empty installation, create its volume, stop the app, and extract the backup. Restore replaces instance state; keep the original volume until the restored installation has been verified.

```sh
docker compose create cilo
docker run --rm --user 0 -v cilo_cilo-data:/data -v "$PWD/../cilo-backups:/backup:ro" --entrypoint sh cilo:local -c 'tar -xzf /backup/cilo-backup.tar.gz -C /data && chown -R 1000:1000 /data'
docker compose up -d
```

Verify login, recovery availability, notes, a drawing, a file download, and search after restoring. Keep backups private: they contain the account password hash and authentication secret.

## Mobile and offline behavior

Install through your browser. On iPhone/iPad use Safari → Share → Add to Home Screen. The PWA needs HTTPS outside localhost. Private notes are network-only. Edits that fail to save remain in the open tab and can be retried; closing the tab can lose them. Full offline editing and synchronization are deferred.

## Export and import

Use note actions for Markdown packages. They contain a Markdown file, attached files, Mermaid source, drawing previews, and editable `.excalidraw` sidecars. Some rich formatting is simplified.

Use Settings → Files & data for lossless Cilo bundles. Import adds new notes and remaps file identifiers; it does not overwrite existing notes. Bundle uploads are limited to 100 MiB compressed and 150 MiB expanded. Keep full instance backups for larger datasets and account restoration.

## Image footprint

The verified Linux AMD64 production image has approximately 85.1 MB of compressed OCI layers. The local Docker engine reports approximately 304.6 MB of stored image data; engine accounting and compressed transfer size differ. These measurements include the rich editor, diagrams, drawing fonts, and static assets. Future dependency changes can change the footprint. Node's unnecessary binary symbols are stripped in an isolated stage; the final image has no package manager, compiler, application source, tests, or development dependencies. Architecture-specific SQLite and Node runtime checks were performed on AMD64.
