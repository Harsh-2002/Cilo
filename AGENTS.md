# Nivra website

This independent `web` branch is the static product website; application code remains on `main`. Do not merge branches or commit application data, private addresses, credentials, audit artifacts or browser sessions.

Read PRODUCT.md for verified scope and DESIGN.md for visual decisions; .impeccable/design.json contains the matching machine-readable design metadata. README.md covers local development and Pages publishing; public/screenshots/provenance.json identifies demo screenshots. Keep these references concise and current.

Use Node.js 24 and npm. Pin direct dependencies and commit the lockfile. Fetch current framework/cloud documentation with Context7 before setup or API changes. Apply Impeccable to interface changes. Verify light/dark themes, keyboard access, reduced motion and mobile/desktop layouts in the browser. Run `npm run check`, `npm run build` and `npm test` before committing and pushing to `web`.

Keep the page minimal and readable. Use real Nivra captures with authored demonstration content. Do not invent testimonials, usage metrics, hosted signup or unsupported product features. Keep public asset URLs under the configured Pages base path.
