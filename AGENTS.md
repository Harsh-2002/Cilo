# Cilo agent instructions

Read PRODUCT.md, DESIGN.md, and docs/architecture.md before changing behavior.

- Keep the app minimal, monochrome, responsive, and self-hosted.
- SQLite is the only supported database. Keep persistent files under CILO_DATA_DIR.
- Keep owner creation, onboarding, and ordinary preferences in the UI.
- Preserve unsaved edits, revision checks, and the single-owner invariant.
- Use current Context7 documentation for library-specific work. Resolve a library first, then query one concept at a time, with at most three commands per question. Never include secrets in queries.
- Keep comments rare and limited to concise single lines explaining intent.
- Use a feature branch and pull request for application changes. Do not push application changes directly to main.
- Run type checking, lint, tests, build, and relevant browser checks. Test persistence and Docker when changing storage or delivery.
- Do not commit data, credentials, recovery codes, test accounts, or generated review screenshots.
- README covers the quick start; detailed references belong in docs. Update verified behavior in documentation.
