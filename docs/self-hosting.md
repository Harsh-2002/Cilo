# Self-hosting

## Start and onboard

Run `docker compose up -d --build`, then open `http://localhost:3000`. Create your name, username, and password in the onboarding wizard. Passwords require at least 12 characters. Download the recovery code before continuing. No SMTP, manual auth secret, or account environment variables are required.

Complete setup before making a fresh installation available to other people: the first successful setup submission creates its owner. Later signup is disabled. This installation supports exactly one owner.

## Runtime configuration

The production Dockerfile uses separate dependency, build, and runtime stages. The final stage starts from Alpine and includes Node, its runtime libraries, Next.js standalone output, static assets, and migrations. npm, Yarn, TypeScript, compilers, and development source are excluded. SQLite is compiled or installed for the same platform as the runtime. Run development directly with `npm ci` and `npm run dev` for hot reload.

| Variable             | Default                                 | Purpose                                                                                                |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NIVRA_PORT`         | `3000`                                  | Host port published by Compose                                                                         |
| `NIVRA_BIND_ADDRESS` | `127.0.0.1`                             | Host interface published by Compose                                                                    |
| `NIVRA_PUBLIC_URL`   | Browser request origin                  | Canonical origin, e.g. `https://notes.example.com`, for reverse-proxy authentication and origin checks |
| `NIVRA_DATA_DIR`     | `./data` locally; `/app/data` in Docker | Database, secret, and uploads                                                                          |

Set variables in the shell or copy `.env.example` to `.env`. Appearance belongs in UI settings. The attachment limit is configured with `NIVRA_UPLOAD_LIMIT_MIB` (default 25; integer 1–100). Storage configuration is environment-only. Authentication secrets are generated on first boot and preserved in the data directory.

For LAN access, publish to a suitable interface. For mobile installation and remote access, serve HTTPS through your reverse proxy, preserve the request host, and set `NIVRA_PUBLIC_URL` to the browser-visible origin. Keep the app at the domain root; subpath hosting is not supported. The app container runs as the Node user, UID 1000. A custom bind-mounted data directory must be writable by that user.

```sh
NIVRA_BIND_ADDRESS=0.0.0.0 NIVRA_PUBLIC_URL=https://notes.example.com docker compose up -d --build
docker compose ps
docker compose logs --tail=100 nivra
```

## Upgrade

Back up first, update the checkout, then run `docker compose up -d --build`. Ordered migrations run before requests are served. A migration or storage-permission failure prevents startup rather than running with a partial schema. Keep the data volume when recreating containers.

## Full instance backup and restore

Nivra creates encrypted recovery copies while you continue using the app. They include SQLite (notes, tasks, bookmarks, search, accounts, MFA, recovery state and published snapshots), the authentication secret, and every referenced file from local or hybrid S3 storage. Backup objects do **not** contain the master encryption key: retain the original `encryption.key` or externally managed key separately. Without that key, recovery is impossible. A readable export bundle serves a different purpose and does not contain credentials or shared-link state.

Settings → Import & export → Instance backups shows the destination, last completion, next scheduled run, recent copies and errors. Back up now starts a background copy. Verify checks a complete restoration in a disposable directory, including the database and every file. Credentials and scheduling stay in the environment:

| Variable                      | Default                  | Purpose                                                                           |
| ----------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `NIVRA_BACKUP_BACKEND`        | `local`                  | `local`, `s3`, or `off`; encryption remains mandatory                             |
| `NIVRA_BACKUP_DIR`            | `NIVRA_DATA_DIR/backups` | Local destination; use a separate disk for host-failure recovery                  |
| `NIVRA_BACKUP_INTERVAL_HOURS` | `24`                     | Positive interval in hours, at most 8760; checked every minute while the app runs |
| `NIVRA_BACKUP_KEEP`           | `7`                      | Number of completed copies retained, integer 1–365                                |

Backups start when due after owner setup. Missed schedules are checked on the next running minute. Only completed copies appear; interrupted copies cannot be restored as complete. Retention applies after successful creation and also cleans abandoned objects older than a day. Check errors if a destination is unavailable or full. Keep enough RAM for the largest database/file object, disk space for the temporary encrypted snapshot, and disk space for the full dataset when verifying/restoring.

For an independent private S3-compatible backup destination, set `NIVRA_BACKUP_BACKEND=s3` and `NIVRA_BACKUP_S3_BUCKET`, `NIVRA_BACKUP_S3_ACCESS_KEY_ID`, `NIVRA_BACKUP_S3_SECRET_ACCESS_KEY`. Optional variables are `NIVRA_BACKUP_S3_ENDPOINT`, `NIVRA_BACKUP_S3_REGION` (default `us-east-1`), `NIVRA_BACKUP_S3_PREFIX` (default `nivra-backups/`) and `NIVRA_BACKUP_S3_FORCE_PATH_STYLE` (default `true`). MinIO, RustFS and AWS S3 use the ordinary object API. Create the bucket first; grant ListBucket on the prefix and GetObject, PutObject and DeleteObject on its objects. Use a dedicated prefix separate from media; overlapping configured media/backup prefixes are rejected. Do not point an external bucket lifecycle policy at retained backups unless you accept it independently expiring them.

Host CLI commands load `.env` when present and respect shell overrides:

```sh
npm run backup -- create
npm run backup -- list
npm run backup -- verify BACKUP_ID
NIVRA_ENCRYPTION_KEY_FILE=/safe/original-encryption.key npm run backup -- restore BACKUP_ID /srv/nivra-restored
```

Point `NIVRA_BACKUP_DIR` or `NIVRA_BACKUP_S3_*` at the original backup destination during disaster recovery. The key file contains 32 raw bytes, not a hex string. Use `NIVRA_ENCRYPTION_KEY` for an externally managed 64-character hex key. List/verify need the original key as well. Recovery requires a new or empty destination; populated directories and symlinks are rejected. Backups from hybrid storage restore **locally**, including remote files, so the original media service is not needed. Stop the old installation before switching to the restored directory, set `NIVRA_STORAGE_BACKEND=local`, preserve the original key configuration, and verify login, MFA/recovery, notes, tasks, bookmarks, files, shared links and search. Retain the old data until this succeeds.

The production image ships the same CLI as `backup-cli.cjs`:

```sh
docker compose exec nivra node backup-cli.cjs create
docker compose exec nivra node backup-cli.cjs list
docker compose exec nivra node backup-cli.cjs verify BACKUP_ID
```

For recovery using the production image, mount a **separate recovery directory** and the original key/backup source into a one-off container. Restore to a new subdirectory inside that mount so atomic staging works; do not target the mount root or active data volume:

```sh
mkdir -p ../nivra-recovery
docker run --rm --user 0 -v "$PWD/../nivra-recovery:/recovery" --entrypoint chown nivra:local 1000:1000 /recovery
docker run --rm -v "$PWD/../nivra-recovery:/recovery" -v "$PWD/../recovery-source:/source:ro" -e NIVRA_DATA_DIR=/source -e NIVRA_BACKUP_DIR=/source/backups -e NIVRA_ENCRYPTION_KEY_FILE=/source/encryption.key nivra:local node backup-cli.cjs restore BACKUP_ID /recovery/data
```

Here `../recovery-source` is your protected recovery directory containing the original key and encrypted backup objects. For S3 backups, pass the backup environment configuration instead of a local backup directory. After verification, stop the old app and use a Compose override to bind `../nivra-recovery/data` to `/app/data`; restart with local file storage. The original volume remains available for rollback. The CLI needs write permission on the destination's parent for atomic staging.

For a simple complete-directory backup, stop Nivra and copy the whole data directory, including WAL files, files and the default key. A live `nivra.sqlite` copy alone is incomplete. Hybrid storage additionally needs every remote file. The automated recovery format avoids both of these consistency problems. Complete-directory copies containing the key must be kept private.

## Mobile and offline behavior

Install through your browser. On iPhone/iPad use Safari → Share → Add to Home Screen. The PWA needs HTTPS outside localhost. Private notes are network-only. Edits that fail to save remain in the open tab and can be retried; closing the tab can lose them. Full offline editing and synchronization are deferred.

## Export and import

Use note actions for Markdown packages. They contain a Markdown file, attached files, Mermaid source, drawing previews, and editable `.excalidraw` sidecars. Some rich formatting is simplified.

Use Settings → Import & export for lossless Nivra bundles. Import adds new notes and remaps file identifiers; it does not overwrite existing notes. Bundle uploads are limited to 100 MiB compressed and 150 MiB expanded. Keep full instance backups for larger datasets and account restoration.

## Image footprint

The verified Linux AMD64 production image has approximately 85.1 MB of compressed OCI layers before the S3 SDK was added. The local Docker engine reports approximately 304.6 MB of stored image data in that build; engine accounting and compressed transfer size differ. These measurements include the rich editor, diagrams, drawing fonts, and static assets. Future dependency changes can change the footprint. Node's unnecessary binary symbols are stripped in an isolated stage; the final image has no package manager, compiler, application source, tests, or development dependencies. Architecture-specific SQLite and Node runtime checks were performed on AMD64.

## S3-compatible files (MinIO or RustFS)

SQLite, account state, and the authentication secret remain in the local data directory. Set these variables to store attachments, bookmark previews, and publication assets in a private, pre-created S3-compatible bucket:

```dotenv
NIVRA_STORAGE_BACKEND=s3
NIVRA_S3_ENDPOINT=https://objects.example.com
NIVRA_S3_REGION=us-east-1
NIVRA_S3_BUCKET=nivra
NIVRA_S3_ACCESS_KEY_ID=your-access-key
NIVRA_S3_SECRET_ACCESS_KEY=your-secret-key
NIVRA_S3_PREFIX=nivra/
NIVRA_S3_FORCE_PATH_STYLE=true
NIVRA_UPLOAD_LIMIT_MIB=25
```

Use the S3 API endpoint, not the MinIO/RustFS console endpoint. Omit `NIVRA_S3_ENDPOINT` for AWS S3. Path-style addressing defaults to true for MinIO and RustFS; set it to false when your service requires virtual-host addressing. Give the account object read, write, and delete permissions within the chosen bucket and prefix. Nivra does not create buckets or make them public. Browsers read files through Nivra, so bucket CORS is unnecessary.

Restart after changing configuration. To switch an existing installation, stop Nivra, retain the source backend in `NIVRA_STORAGE_BACKEND`, configure the target S3 variables if needed, and run `npm run backup -- copy-files s3` (or `copy-files local`). In the production image use `node backup-cli.cjs copy-files s3` in a one-off container with the same data mount and environment. This copies every referenced file, including shared copies and bookmark previews, verifies its contents, accepts matching existing objects for safe retries, rejects different destination objects, and retains the source. Then change `NIVRA_STORAGE_BACKEND` to the target and restart. Do not edit or upload during copying. The encryption key is preserved; no plaintext files are written. Automated full-instance backups include the SQLite data and all referenced remote objects, including published-file copies and bookmark previews. Manual directory backups need the remote objects as well. Use a dedicated ordinary object bucket; S3 Tables are not used.

## Batch import and publishing

Settings → Import & export accepts up to 100 files per batch. Markdown and text files become notes. Selecting a folder retains relative paths, allowing selected images and attachments referenced by Markdown to be uploaded and relinked. Remaining files become their own attachment notes. Markdown files are limited to 8 MiB; attachments use the server-configured limit. Failed items are reported individually and incomplete note imports are cleaned up. Successful imports are retained.

Choose Share & publish from a note, inspect Reader preview, then publish. The public `/share/<token>` link contains a read-only snapshot, with copies of referenced attachments and drawing previews. Editing the private note does not change that snapshot until Publish latest version is chosen. Stop sharing revokes the note and asset endpoints; republishing creates a new token. Moving a published note to trash also revokes its link. Public links are unlisted and marked noindex, but anyone with the link can read them. Publication state is part of a full instance backup; Nivra bundles restore notes privately and do not restore share links.

## Optional authenticator MFA

Settings → Account → Two-factor authentication starts TOTP enrollment. Confirm your current password, scan the QR code (or enter the setup key manually), and verify the six-digit code. MFA activates only after verification. Download and acknowledge the single-use backup codes before leaving setup. Other sessions are revoked when MFA is enabled or disabled.

After activation, password sign-in creates a short-lived challenge; private notes remain inaccessible until a valid authenticator or backup code is supplied. Invalid attempts are rate-limited. Disabling MFA requires the current password. The original Nivra account recovery code resets the password, clears MFA enrollment and pending challenges, revokes sessions, and issues a replacement recovery code. Re-enroll MFA after recovery. Keep the authentication secret in backups: it encrypts the TOTP enrollment data.

## Tasks

Open Tasks from the navigation to add, edit, complete, reopen, search, or delete tasks. Open and Completed views show separate counts. Changes persist in SQLite; revision checks prevent another tab from silently overwriting a task. Lossless bundles include task titles, completion state, and timestamps; importing adds copies. Older bundles without tasks remain compatible. Full data-directory backups include tasks automatically.

Shared notes show their content, a Shared note label, and the publication date without Nivra branding. Existing `/p/<token>` links redirect to `/share/<token>`.

## Encryption and key custody

Encryption at rest is mandatory, with no UI or environment switch to turn it off. SQLite (including search indexes and WAL), attachments in both storage backends, published-file copies, and the authentication secret are encrypted. Existing data is migrated on startup; keep the instance stopped during upgrades and wait for startup and health checks to finish before serving traffic. Migration requires existing objects to be reachable, so do not switch storage backends at the same time. Older backups, filesystem snapshots, and previous versions in versioned S3 buckets are not rewritten by this migration.

The default setup creates a random 32-byte `encryption.key` in the data directory with owner-only permissions. That keeps a complete folder backup restorable. A backup containing both encrypted data and this key does not protect against someone obtaining the entire backup. For that threat, supply `NIVRA_ENCRYPTION_KEY` as a random 64-character hexadecimal key from a secret manager, or `NIVRA_ENCRYPTION_KEY_FILE` pointing to a separately mounted file of exactly 32 raw bytes. Compose forwards both variables; a key-file path also requires the corresponding read-only mount in your Compose override. Keep externally managed keys outside the data backup and retain them separately for recovery.

Files written by this version use a chunked encrypted format (the chunked v2 format) that earlier releases cannot read, so restore a backup taken before upgrading if you need to return to an older release. Attachments written by earlier releases remain readable, and those of 1 MiB or more are converted to the chunked format the first time they are opened; no administrator action is needed.

Do not change or delete an established key: existing data requires the original key, including restored S3 objects. Incorrect or missing keys stop startup; Nivra never creates a replacement for an encrypted database. Key rotation is not yet an exposed operation. This protects stored data, not a compromised running server; use HTTPS for traffic. Authorized readers receive decrypted content, and share links intentionally expose their published snapshot. Explicit Markdown and bundle exports contain readable content for portability; protect downloaded exports separately.

## Bookmarks

Open Bookmarks from navigation and paste a complete HTTP or HTTPS URL. Nivra fetches the title, description, thumbnail and favicon and stores a clickable card. Collections and favorites organize links; search covers URL, title, description and collection with prefix and typo matching. Edit details, refresh a preview, or delete a saved link from its menu. If a site blocks fetching or a URL points at a private network, the link still saves with a fallback card; Nivra does not fetch internal addresses. Authenticated preview images are cached locally or in configured S3 media storage, with encryption always enabled. Browser-extension capture is deferred.

Lossless bundles preserve bookmark details and preview assets. Imports skip URLs already saved, preserve existing cards, and accept older bundles without bookmarks. Full-instance backups retain bookmarks automatically.

## Rename compatibility

Use `NIVRA_*` variables and `/api/nivra/`. Fresh instances use `nivra.sqlite`, `nivra/` for S3 files and `nivra-backups/` for S3 backups. Historical database filenames are detected automatically; original encryption inputs and object signatures stay unchanged. Earlier backups and bundles remain importable, and saved private URLs are rewritten to the authorized current API. Keep existing keys: branding changes never regenerate them. Existing authenticator entries continue to work; new TOTP enrollment uses Nivra as issuer.

Artifacts are included in full-instance backups with their original files, thumbnails, extracted text and search indexes. Note bundles export notes and their attachments; use full-instance backups to preserve the separate artifact shelf. OCR runs locally with bundled English language data and does not send saved files to an external service. Image OCR is bounded to 60 million pixels and a 90-second recognition deadline. PDF extraction supports embedded text up to 40 MiB/400 pages; scanned PDFs are stored but are not OCR-transcribed. Unsupported file formats remain downloadable and searchable by filename. Audio/video playback depends on the browser's codec support; audio is not transcribed.

For an existing Compose installation, convert environment variable names to `NIVRA_*`, preserve the existing S3 media/backup prefixes explicitly, and set `NIVRA_DATA_VOLUME` to the exact existing named volume before starting. Keep the original project name with `docker compose -p <original-project>`, stop the old service without deleting volumes, then start `nivra`. Renaming a checkout changes the default project name; the explicit volume setting prevents a new empty volume from being selected. Native host configuration still accepts historical aliases through the upgrade boundary, with explicit current values taking precedence.
