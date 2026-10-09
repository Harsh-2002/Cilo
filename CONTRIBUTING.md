# Contributing

Read [AGENTS.md](AGENTS.md), [product scope](PRODUCT.md), and [design guidance](DESIGN.md). During initial development, the owner may push verified changes directly to `main`. External contributors should open a pull request describing the problem, resulting behavior, and relevant validation.

Use Node.js 24 and `npm ci`. Run the checks in the [testing guide](docs/testing.md). Check desktop and mobile when changing the interface, and Docker persistence when changing storage or packaging. Tests create disposable data outside the repository; never point them at a real installation.

Keep code comments minimal and concise. Preserve the monochrome interface and single-owner model. Do not commit private notes, credentials, generated secrets, recovery codes, or data directories. Put detailed documentation in `docs/`; keep the README focused on getting started.
