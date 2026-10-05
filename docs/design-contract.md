# Workspace direction contract

The user pinned a minimal, black-and-white, Vercel-like shadcn interface. That brief is the visual authority. This record was added during finish review; it does not claim a pre-build concept approval or an approved image comp. The implementation is code-led. Impeccable's recorded direction seed is `11bedf68` (Operate, catalog pool `c3b204a1eed6`); the explicit brief takes precedence over the random assignment.

## THESIS

Make writing the largest and quietest surface. Notes, organization, and artifacts are one workspace rather than competing dashboards.

## OWN-WORLD

Neutral light and dark grounds, locally bundled Geist, one-pixel rules, Lucide controls, and inverse primary actions carry the identity. Color belongs to user drawings, diagrams, and highlighted code. No decorative hero, card dashboard, visible construction grid, or material imitation is needed for this task.

## STORY

Onboarding establishes ownership and saves a recovery code. The owner creates or finds a note, writes and inserts artifacts, organizes with tags or favorites, and exports their data. Daily Journal pages start blank unless the owner explicitly selects a template. Save state and conflict recovery stay visible. Deployment settings stay outside everyday writing.

## FIRST VIEWPORT

The sidebar places Search above Overview, Favorites, Notes, Journal, Tasks, Bookmarks, Templates, and Trash, with Settings alone at the footer and no avatar or account strip. The Overview leads with live local date and time, quick actions, and task, note, and bookmark widgets; it has no header bar or promotional headline/tagline. Its mobile navigation button remains visible.

In the notes view, desktop uses a 216px navigation rail, 300px searchable list, and fluid editor with a 740px outer writing-surface maximum. Its 44px desktop gutters leave a 652px content measure, with 44px above the title. The title, tags, save state, and note actions stay close to the writing surface. Tablet collapses the rail. Mobile shows the list or editor with a visible back action, 26px writing gutters, and 44px touch targets.

## FORM

The note list is a narrow index beside an open writing sheet. The signature interaction is selection opening the note while its revision-checked save state remains visible; failed saves preserve the current draft and guard navigation. The editor has no bottom status strip or persistent insertion toolbar; slash-menu and formatting controls remain available in the writing flow. Drawings open a focused canvas, then return as editable previews. Settings and onboarding use the same type, borders, controls, and theme.

Global search keeps its open state local so opening the dialog does not rerender the workspace or editor. Its shared shadcn Dialog/Command palette has a 560px maximum width, a flat search input, aligned result icons and separate truncated title/excerpt rows. A fixed 352px results pane shrinks with available viewport height to absorb asynchronous updates without shifting the dialog; the backdrop remains unblurred. Filter syntax is disclosed through a shadcn Popover, with Escape closing help before the parent search. Desktop keyboard hints disappear on phones, where close/help targets are 44px and input text is 16px. The public reader renders semantic HTML from the immutable published snapshot for each request; its header shows “Shared note” and the publication date without Cilo branding. Code highlighting and safe diagram rendering load as enhancements. Not-found, loading, and error fallbacks share the same neutral page treatment.

## Quality bar

- Editor type: desktop prose 14px at 1.65 line spacing and desktop titles 26px; mobile prose stays 16px and titles use 24px. Titles wrap without clipping. Public-reader prose remains 16px at 1.75 line spacing.
- Editor blocks use 4px vertical padding and source code uses 12px monospace text.
- Compact desktop controls; mobile note-topbar actions at least 44px high.
- Readable neutral text, visible keyboard focus, themed selection/caret/scrollbars, and reduced-motion support.
- No horizontal page overflow at the reviewed 390px, 820px, and 1440px viewports.
- While typing on mobile, the viewport resizes around the software keyboard so the note controls remain reachable.
- Explicit empty, loading, error, conflict, and offline states with a next action.
- Keep rich editor, diagrams, code, and drawing controls usable across themes and viewport sizes.

## Accepted visual extensions

These code-led extensions preserve the neutral workspace. Named tag colors are the explicit content-color exception: Gray (#737373), Red (#ef4444), Orange (#f97316), Yellow (#eab308), Green (#22c55e), Blue (#3b82f6), Purple (#a855f7), and Pink (#ec4899) are user-selected tag metadata. The chosen color marks the tag dot and lightly tints its chip; it does not become a general interface accent.

The note title stays borderless and signals keyboard focus with a muted fill; a ResizeObserver recalculates its height when wrapping changes. Settings remains a centered dialog with horizontal Appearance, Account, and Import & export tabs, compact security rows, and scrollable content without visible scrollbar chrome. Use styled shadcn controls for forms, searchable code-language selection, and confirmations. Keep About and editable storage or file-size controls out of settings. Reuse the folded-page C monogram from the shared local path in the branded app shell, favicon, and mobile icons, but not in the public reader.

Tasks is a separate view beside navigation, with a centered 800px outer shell, 52px desktop gutters, and 20px mobile gutters. Keep its header, inline creation, Open and Completed filters with counts, search, and wrapping task rows within the pane. Checkbox completion and reopening, inline title editing, and styled deletion confirmation remain available. Use 44px mobile interaction targets and retain explicit loading, error, and empty states.

The code-language picker uses a shadcn Popover and Command with one search header. Keep it within 24px of viewport width, bound its height by available viewport space, use 36px desktop and 44px mobile options, and show one active keyboard option alongside a separate check for the saved language.

The publishing preview and public read-only reader follow the workspace's quiet typography and neutral surfaces with responsive reading gutters. The public reader shows the “Shared note” label and publication date, with no Cilo name or mark. Publishing controls remain separate from the reader content.

The review screenshots are verification fixtures containing synthetic notes and are excluded from Git. No seed, diagram, or screenshot is a substitute for verified application behavior.

Editor body headings use explicit sizes: H1 24px, H2 20px, H3 18px, H4 16px, H5 15px and H6 14px; mobile H5/H6 have a 16px minimum. Heading line-height is 1.35 and weight is 600. Scope this ramp to the writing surface, including nested content, rather than scaling navigation or the public reader.

Page width offers Standard and Wide from note actions. Wide fills the available writing pane without changing typography or responsive gutters; persisted per-note state follows autosave/revision handling and portable bundles.
