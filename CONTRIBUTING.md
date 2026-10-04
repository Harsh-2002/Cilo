# Contributing

Read [AGENTS.md](AGENTS.md), [product scope](PRODUCT.md), and [design guidance](DESIGN.md). Use a feature branch and open a pull request describing the problem, resulting behavior, and relevant validation.

Use Node.js 24 and `npm ci`. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Check desktop and mobile when changing the interface, and Docker persistence when changing storage or packaging. Tests create disposable data outside the repository; never point them at a real installation.

Keep code comments minimal and concise. Preserve the monochrome interface and single-owner model. Do not commit private notes, credentials, generated secrets, recovery codes, or data directories. Put detailed documentation in `docs/`; keep the README focused on getting started.
