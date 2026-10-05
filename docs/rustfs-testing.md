# Disposable RustFS integration check

The 2026-10-04 verification used RustFS 1.0.1 with Nivra's ordinary S3 adapter. It did not use S3 Tables or replace SQLite.

The test service is a separate `nivra-rustfs-review` Docker container. Its API is bound only to `127.0.0.1:19000`, the console is disabled, and private credentials live in an owner-only temporary directory. The image digest was `sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c`. Data and logs use named volumes owned by UID 10001. No existing homelab RustFS service was changed.

Nivra's disposable production instance runs on port 3004 with a separate encrypted data directory. Its file backend uses a private media bucket with path-style requests, and its independently configured backup backend uses a different private bucket and prefix. The normal installation on port 3001 keeps its existing storage configuration.

## Repeatable procedure

1. Create a private temporary directory and generate credentials without printing them. Use the supported `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY` and `RUSTFS_CONSOLE_ENABLE=false` configuration.
2. Start the pinned RustFS image with private data/log volumes and a loopback API binding. Wait for `/health/ready`.
3. Create separate private media and backup buckets with an authenticated S3 client. Configure only the disposable Nivra process through its local environment file; see [storage configuration](self-hosting.md).
4. Start a production standalone copy on a test port with an isolated encrypted data directory and owner account. Use `copy-files s3` on the fixture when testing a local-to-hybrid transition; retain the source.
5. Upload a file through Nivra, fetch it through the authenticated route, and compare bytes. Publish a snapshot with a copied attachment and check anonymous access to the publication while the original remains private.
6. Read raw S3 objects with the test client and check authenticated-encryption envelopes. Verify that anonymous bucket requests are denied and conditional writes cannot overwrite committed backup objects.
7. Create, verify and restore a full encrypted backup into a new directory with the original key. Check the recovered notes, relationships, files and account state. Never restore over a running installation.
8. Recreate only the disposable RustFS container with its original private environment and named volumes. Repeat health, file-read and backup-verification checks.

Credentials, fixture content, keys and screenshots are excluded from Git. Keep the test console closed and the API on loopback. Dispose of test containers and volumes only after saving the verification result; never substitute a real installation's data directory or existing S3 service.
