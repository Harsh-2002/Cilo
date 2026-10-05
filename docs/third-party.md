# Third-party notices

Cilo's own source is MIT licensed. Dependencies retain their original notices and licenses.

- BlockNote core, React, shadcn, code-block, and diagram-block packages: MPL-2.0. No XL packages are used. Modifications to covered upstream source remain subject to its license; Cilo's custom blocks are maintained separately.
- Excalidraw: MIT. Its bundled fonts retain their upstream font licenses. Generated assets are copied from the installed package rather than fetched from a CDN.
- Shiki core, JavaScript engine, precompiled languages and themes, Mermaid, and DOMPurify: MIT. The published reader reuses pinned versions already present in the editor dependency tree.
- Geist: SIL Open Font License 1.1, distributed through `@fontsource-variable/geist`.
- shadcn/ui, Next.js, React, Drizzle, Better Auth, and Lucide retain their package licenses. The lockfile records the complete dependency set.

See the LICENSE files in installed packages and upstream distributions for full terms. Review dependency advisories when updating; do not use `npm audit fix --force` to silently downgrade the editor or framework.
