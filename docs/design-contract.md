# Workspace direction contract

The user pinned a minimal, black-and-white, Vercel-like shadcn interface. That brief is the visual authority. This record was added during finish review; it does not claim a pre-build concept approval or an approved image comp. The implementation is code-led. Impeccable's recorded direction seed is `11bedf68` (Operate, catalog pool `c3b204a1eed6`); the explicit brief takes precedence over the random assignment.

## THESIS

Make writing the largest and quietest surface. Notes, organization, and artifacts are one workspace rather than competing dashboards.

## OWN-WORLD

Neutral light and dark grounds, locally bundled Geist, one-pixel rules, Lucide controls, and inverse primary actions carry the identity. Color belongs to user drawings, diagrams, and highlighted code. No decorative hero, card dashboard, visible construction grid, or material imitation is needed for this task.

## STORY

Onboarding establishes ownership and saves a recovery code. The owner creates or finds a note, writes and inserts artifacts, organizes with tags or favorites, and exports their data. Save state and conflict recovery stay visible. Deployment settings stay outside everyday writing.

## FIRST VIEWPORT

Desktop uses a 216px navigation rail, 300px searchable list, and fluid editor with an 800px outer writing-surface maximum. Its 52px desktop gutters leave a 696px content measure. The title, tags, save state, and artifact insertion are immediately available. Tablet collapses the rail. Mobile shows the list or editor with a visible back action and 44px touch targets.

## FORM

The note list is a narrow index beside an open writing sheet. The signature interaction is selection opening the note while its revision-checked save state remains visible; failed saves preserve the current draft and guard navigation. Drawings open a focused canvas, then return as editable previews. Settings and onboarding use the same type, borders, controls, and theme.

## Quality bar

- Prose: 16px with comfortable line spacing; desktop titles 32px and mobile titles 29px, wrapping without clipping.
- Compact desktop controls; mobile topbar and insertion actions at least 44px high.
- Readable neutral text, visible keyboard focus, themed selection/caret/scrollbars, and reduced-motion support.
- No horizontal page overflow at the reviewed 390px, 820px, and 1440px viewports.
- While typing on mobile, the viewport resizes around the software keyboard so the note controls remain reachable.
- Explicit empty, loading, error, conflict, and offline states with a next action.
- Keep rich editor, diagrams, code, and drawing controls usable across themes and viewport sizes.

The review screenshots are verification fixtures containing synthetic notes and are excluded from Git. No seed, diagram, or screenshot is a substitute for verified application behavior.
