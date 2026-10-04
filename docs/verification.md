# Verification record

This records the 2026-10-04 audit of the implemented application. Passing checks are evidence for the listed cases, not a guarantee of defect-free software or a security certification. Reverify after changes.

## Environment and isolation

Node.js 24 on Linux; production Next.js standalone output; Chromium 153 through browser MCP. Browser checks used disposable owner accounts and encrypted directories on ports 3004 and 3005. The existing installation on port 3001 was not used for mutation tests. Production assets were copied with the standalone server and the final fixture ran from an immutable temporary copy to avoid interference from subsequent builds.

No local Docker builds were needed. The repository's shipping workflow builds and smoke-tests the Docker image separately.

## Executed checks

| Area                                | Evidence                                                                                                                                                                                                    | Result                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Automated behavior                  | `npm test`: 31 tests, zero failures or skips                                                                                                                                                                | Passed                                                                                                      |
| Types and production delivery       | `npm run typecheck`; `npm run build`, including bundled backup CLI and private-data tracing guard                                                                                                           | Passed                                                                                                      |
| Source quality                      | `npm run lint`; `npm run format:check`; `git diff --check`                                                                                                                                                  | Passed                                                                                                      |
| Runtime dependencies                | `npm audit --omit=dev`: zero reported vulnerabilities                                                                                                                                                       | Passed at audit time                                                                                        |
| Task browser regression             | 11 assertions covering creation, completion, reopening, edits, navigation protection, keyboard search, failed creation, and canceled/confirmed deletion                                                     | Passed                                                                                                      |
| Bookmark browser regression         | 9 assertions covering fallback links, duplicates, edit protection, favorites, typo search, failed preview retry, and reload persistence                                                                     | Passed                                                                                                      |
| Note browser regression             | 11 assertions covering failed autosave/retry, real concurrent revision conflict, draft recovery, reader preview, anonymous sharing, revocation, and search after reload                                     | Passed                                                                                                      |
| Artifact browser regression         | 9 assertions covering Markdown import, tables, source code, Mermaid SVG, saved drawing scene/preview, trash/restore, and long multilingual titles at 320px                                                  | Passed                                                                                                      |
| Browser security boundaries         | 11 assertions covering anonymous denial across private resources, cross-origin mutation rejection, unsafe URL schemes, and private-response cache policy                                                    | Passed                                                                                                      |
| Mobile onboarding and MFA           | 10 assertions covering recovery acknowledgement, theme selection, explicit setup completion, QR enrollment, backup-code acknowledgement, challenge gating, backup-code login, and rejection of reused codes | Passed                                                                                                      |
| Responsive and accessibility matrix | Notes, tasks, bookmarks, Appearance, Account, and Import & export at 1440, 768, 390, and 320 CSS pixels in light and dark themes: 48 combinations                                                           | No horizontal document overflow, native select controls, or axe WCAG A/AA violations in the examined states |
| Mobile inputs and editor menus      | Affected mobile states repeated after fixes; visible form inputs at least 16px; language menus contained within all four widths                                                                             | Passed                                                                                                      |
| Editor/drawing accessibility        | Editor including language-menu interaction and the loaded drawing dialog scanned with axe-core 4.13.0                                                                                                       | No detected WCAG A/AA violations after fixes                                                                |
| PWA privacy and offline fallback    | Anonymous secure-context browser on localhost; offline navigation showed the authored fallback; cache inventory contained only offline page and app icons                                                   | Passed                                                                                                      |
| Encryption and recovery             | Automated wrong-key, tamper, swapped-object, plaintext migration, encrypted snapshot, retention, interrupted backup, empty-destination restore, and local/hybrid/S3 copy tests                              | Passed                                                                                                      |

The browser regression count is **61 assertions**, separate from the 31 automated server/storage tests. Browser requests intentionally failed during negative tests; those expected HTTP failures are not counted as unexpected console defects. Final normal interactions loaded without unexpected console errors.

## Defects reproduced and fixed

| Priority | Defect                                                                                  | Correction and confirmation                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Opening a second task edit silently replaced the first draft                            | Disable competing task actions while editing; regression verifies draft preservation                                                                          |
| P1       | Task drafts had no browser-navigation protection                                        | Add `beforeunload` protection for pending writes and unfinished text; verify cancellation behavior                                                            |
| P1       | Theme changes could exit first-run setup before its final action                        | Keep status refresh independent of theme setter identity; fresh mobile setup verifies explicit completion                                                     |
| P1       | Editor had no accessible name and suggestion interaction left invalid ARIA on a textbox | Add editor name/multiline attributes and normalize the upstream unsupported expanded attribute; scan after actual menu interaction                            |
| P1       | Drawing menu button had no accessible name                                              | Label the scoped upstream trigger, including remounts; verify with axe and an accessible locator                                                              |
| P2       | Bookmark and task filters could hide unfinished inline edits                            | Disable competing filters/search/refresh until save or cancel; test both sections                                                                             |
| P2       | Some loading containers had names on generic elements                                   | Give named loading containers status semantics                                                                                                                |
| P2       | Mobile account/search inputs rendered below 16px                                        | Correct mobile CSS, including specificity against the shared field rule; verify computed sizes in both themes                                                 |
| P2       | Task search shortcut was handled by the notes workspace                                 | Give Tasks its own search shortcut and exclude it from the notes handler; verify actual focus                                                                 |
| P2       | Reduced-motion mode used a global 0.01ms animation override                             | Keep a brief opacity transition for menus/dialogs and static busy/skeleton indicators; remove slide/zoom and active button translation in reduced-motion mode |

## UI audit assessment

| Dimension                | Score            | Evidence and limits                                                                                                                                   |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility            | 3/4              | Automated scans, labels, keyboard menus and dialogs checked; assistive-technology user testing remains outside this environment                       |
| Performance              | 3/4              | Production build, lazy editor/drawing loading and bounded metadata requests; no large-library endurance benchmark or device performance certification |
| Responsive design        | 3/4              | Four widths, long content, mobile input sizes and menu bounds checked; physical mobile input/keyboard behavior not measured                           |
| Theming                  | 3/4              | Both themes passed the measured matrix and retain the incumbent monochrome system                                                                     |
| Implementation integrity | 3/4              | Shared shadcn/authored controls and consistent flows; detector reported only advisory historical token-scale drift                                    |
| Total                    | **15/20 — Good** | Scoped technical assessment, not a whole-product certification                                                                                        |

Implementation integrity passes at the checked scope. The detector produced 43 advisory findings and no blocking findings, primarily existing literal font-size/radius deviations from the documented scale. Advisory drift is not proof of broken behavior; the existing design authority was preserved. No redesign or sidecar repair was performed as an audit side effect.

## Repeatable browser checks

The exported functions in `scripts/browser-regression.mjs`, `scripts/browser-onboarding.mjs`, and `scripts/browser-responsive.mjs` accept a Playwright page/browser supplied by a test driver or browser MCP. They are not part of `npm test` or CI and do not install a browser themselves.

- Functional phases: `tasks`, `bookmarks`, `notes`, `artifacts`, `security`. Require a disposable production instance on port 3004 authenticated as `Review Owner`. The artifact phase writes notes/files; never point it at real data.
- Onboarding: requires a fresh empty disposable instance on port 3005. It creates an account and enables MFA, keeping generated credentials and authenticator values in memory only. Use a new data directory for every run.
- Responsive: provide `theme`, widths, and `{ axePath, screenshotDir }`; seed an `Audit rich note` containing a code block, along with tasks/bookmarks. Supply a local axe-core script and save screenshots to an ignored directory. Browser scripts must not be run against user content.

The backend test suite independently uses fresh temporary directories. Test credentials, MFA secrets, keys, data, generated screenshots, and browser session files are excluded from Git.

## Remaining verification limits

- Browser coverage here is Chromium. Firefox, Safari/WebKit, physical iOS/Android, software keyboards, assistive technology and PWA installation on physical devices remain unverified.
- The LAN development address uses HTTP. Encryption at rest does not encrypt network traffic. HTTPS is needed for protected transport and mobile PWA secure-context capabilities; no DNS, certificate, reverse-proxy, or public-exposure change was made during this audit.
- S3 tests use a signed, private, paginated compatibility fixture. Live MinIO/RustFS deployments and provider-specific operational failures require an integration environment.
- Offline editing and synchronization, collaboration, browser-extension capture, reminders and recurring tasks remain deferred product scope.
- Automated accessibility checks do not establish full WCAG conformance. Performance under very large collections, long-duration use, interrupted browser processes, and every possible input/state combination is not proven.

Future release verification should run the same regression checks against the exact shipping revision, add the missing browser/device coverage, exercise a real S3 target when configured, and verify HTTPS on the chosen deployment origin. Follow functional verification with the established Impeccable polish pass when a release changes UI.
