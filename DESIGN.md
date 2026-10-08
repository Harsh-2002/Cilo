---
name: Nivra
description: "A quiet personal workspace for notes, writing, and collected ideas."
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "#686868"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  sidebar: "#fafafa"
  destructive: "oklch(0.577 0.245 27.325)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.145 0 0)"
  tag-gray: "#737373"
  tag-red: "#ef4444"
  tag-orange: "#f97316"
  tag-yellow: "#eab308"
  tag-green: "#22c55e"
  tag-blue: "#3b82f6"
  tag-purple: "#a855f7"
  tag-pink: "#ec4899"
typography:
  headline:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "26px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  headline-mobile:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  editor-h1:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h2:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h3:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h4:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h5:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h6:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h5-mobile:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  editor-h6-mobile:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  interface:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
  button:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 500
  navigation:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 450
  search:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 400
  code:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
rounded:
  compact: "4px"
  navigation: "6px"
  row: "7px"
  control: "10px"
  surface: "12px"
  dialog: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
    typography: "{typography.button}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
    typography: "{typography.button}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
    typography: "{typography.button}"
  input-search:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.row}"
    height: "34px"
    padding: "0 43px 0 32px"
    typography: "{typography.search}"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.navigation}"
    height: "36px"
    padding: "9px 11px"
    typography: "{typography.navigation}"
  note-list-item:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.row}"
    padding: "16px 14px"
    typography: "{typography.interface}"
  tag-chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.compact}"
    padding: "3px 7px"
    typography: "{typography.label}"
---

# Design System: Nivra

## Overview

**Creative North Star: "The Quiet Page"**

Nivra keeps the surrounding workspace quiet so the note remains the largest, clearest surface. Bundled Geist, neutral light and dark grounds, fine separators, and restrained controls give it the familiar Vercel-like shadcn character chosen for this build.

The desktop workspace places navigation, a searchable note index, and a fluid editor side by side. On smaller screens, the app changes which pane is visible to protect the writing area. Color stays with user-authored drawings, diagrams, highlighted code, named tag-color metadata, and clear semantic states.

**Key Characteristics:**

- Writing stays visually dominant inside the workspace.
- Neutral surfaces, thin separators, and compact controls organize the app.
- Color belongs to note artifacts, user-selected tag metadata, or a clear semantic state.

## Colors

The interface uses a restrained grayscale palette in both themes; the named palette below is reserved for user-selected tag metadata, alongside color inside note content and clear semantic states.

### Primary

- **Deep Ink:** The primary action surface in light mode; the action and its foreground reverse in dark mode.
- **Inverse Paper:** The primary action text color, reversed with the action surface in dark mode.

### Neutral

- **Paper:** The main workspace background; its dark-theme counterpart anchors the same pane structure.
- **Ink:** Main text, titles, and active controls.
- **Soft Gray:** Search fields, selected rows, and quiet interaction fills.
- **Quiet Gray:** Supporting text, timestamps, and secondary controls.
- **Fine Rule:** Pane boundaries and input outlines.
- **Sidebar Paper:** A subtly separate ground for desktop and mobile navigation.
- **Popovers:** Theme-matched surfaces for menus and dialogs.

Destructive actions retain a reserved semantic color; it does not become a general accent.

### User-Selected Tag Metadata

- **Gray** (#737373), **Red** (#ef4444), **Orange** (#f97316), **Yellow** (#eab308), **Green** (#22c55e), **Blue** (#3b82f6), **Purple** (#a855f7), and **Pink** (#ec4899) are selectable tag colors.
- The selected color appears in a small tag dot and as a 12% tint mixed into that tag's chip surface. It remains tag metadata and does not color general workspace chrome.

### Named Rules

**The Content-Color Rule.** Keep normal workspace chrome neutral. Owner-selected tag colors may appear only on their tag dot and chip; drawings, diagrams, and highlighted code may retain their own colors, while destructive color stays with that action state.

## Typography

**Display Font:** Geist Variable (system-ui, sans-serif fallback)

**Body Font:** Geist Variable (system-ui, sans-serif fallback)

**Label/Mono Font:** ui-monospace, SFMono-Regular, monospace for source and code.

**Character:** The locally bundled Geist family keeps the app direct and compact without introducing a display face. Weight and spacing create hierarchy while prose remains open and readable.

### Hierarchy

- **Headline:** The headline token sizes the editor title at 26px desktop and 24px mobile; the public reader keeps its separate title sizing.
- **Body:** The body token governs desktop BlockNote prose at 14px with 1.65 line spacing. Mobile editing stays at 16px, and the public reader remains 16px with 1.75 line spacing.
- **Interface:** The interface token sets the compact application baseline.
- **Button:** A slightly stronger interface weight marks actions without changing the family.
- **Navigation and labels:** Smaller roles support note counts, timestamps, navigation, and tags.
- **Editor body headings:** The writing surface uses the `editor-h1` through `editor-h6` tokens in level order, with the mobile tokens for H5 and H6. These sizes apply inside note content, including nested content.
- **Code:** A system monospace stack separates editor source blocks from prose at 12px; public-reader code keeps its reading-surface sizing.

## Layout

The desktop notes view uses a 216px navigation rail, a 300px searchable note list, and a fluid editor. Standard writing uses a centered 740px outer maximum with 44px horizontal gutters, leaving up to 652px for note content; its top gutter is 44px. Wide writing removes the outer maximum and fills the available editor pane while keeping the same gutters and type scale. Below 1100px the editor gutters reduce to 36px; below 1024px the Standard surface can grow to 760px as the rail becomes a drawer. At 767px and below, mobile shows either the list or open note with a visible back action, 20px writing gutters, a 24px editor title, and 16px prose. The mobile viewport resizes for the software keyboard so editing controls remain reachable. Save state and note actions sit inside the writing surface above the date, title, tags, and body, all using the same gutter. The labeled Page width choice is stored with each note.

The note list and note editor own their vertical scrolling inside the viewport. Onboarding and settings reuse the same typography, neutral borders, and theme roles rather than introducing another visual system. On desktop, Settings sits in a centered 600px dialog with horizontal Appearance, Account, and Import & export tabs; its content scrolls without visible scrollbar chrome. The public reader uses responsive reading gutters and renders the immutable published snapshot as semantic HTML on each request. Its header contains only “Shared note” and the publication date, and code highlighting and diagram rendering load as enhancements.

Overview, Tasks, Bookmarks, Artifacts, and Trash share a content heading with a section title and short description. The content is left aligned beside navigation, with a 1440px maximum and 40px desktop / 20px mobile horizontal gutters. Headings, forms, filters, and results share that gutter. There is no separate section toolbar or manual refresh button; completion, reconnect, and focus updates reconcile through the shared SSE client. Mobile navigation sits at the right of the section title. Notes, Favorites, and Journal keep their functional list controls beside their content headings. Tasks, Bookmarks, and Artifacts use 44px creation controls, visible field labels where applicable, bordered 44px search fields, and filter rows with matching spacing and separators. Mobile status/type filters use styled selectors. The sidebar contains navigation, Search and Quick without a separate creation button. Creation belongs to Overview, Quick and each section’s own controls; Trash has no creation action. Trash lists all deleted item types with their type and deletion date, restoration, and confirmed permanent deletion. Empty states use centered icons, readable title spacing, and bounded descriptions.

Authentication screens use a single logo in the form body, with no separate header. Feedback appears inline in the current section or dialog with a dismiss action and accessible status/error announcements. Do not use floating toasts on desktop, mobile, or the installed PWA.

## Elevation & Depth

The workspace relies on tonal fills and one-pixel separators instead of resting card shadows. Hovered and selected rows use a quiet surface shift. Transient menus use the theme's medium shadow and the mobile navigation sheet uses its larger shadow; dialog surfaces use a fine outline. Motion stays brief and functional, and reduced-motion preferences collapse transitions and animation to near-zero duration.

### Named Rules

**The Flat-at-Rest Rule.** Workspace planes stay flat at rest; soft shadows appear on transient menus and the navigation sheet.

## Shapes

The workspace panes stay square and rely on separators for structure. Buttons and fields use the shared control radius; navigation rows and note-list selections are slightly softer, while tags stay compact. Dialogs and the canvas use the larger surface radii. Keep these differences tied to component function rather than rounding every edge uniformly.

## Components

### Buttons

- **Shape:** Gently softened controls with the shared control radius.
- **Primary:** The default action inverts foreground and background; its hover reduces the fill opacity.
- **Outline and ghost:** Outline buttons keep the surface and border; ghost buttons stay borderless and gain a muted hover fill.
- **Hover / Focus:** Buttons make a small active press shift. Keyboard focus uses one visible neutral inset outline.
- **Touch use:** Note-topbar actions reach a 44px control height on mobile.

### Chips

- **Style:** Tags use a compact fill and small radius. A selected metadata color marks the dot and softly tints only that tag's chip surface; text remains theme foreground.
- **State:** The selected tag sits next to the add-tag action; removing a tag stays available within the chip.

### Cards / Containers

- **Corner Style:** The note workspace itself is not a card; it is divided into rectangular panes.
- **Background:** Selected note rows use the accent surface, and drawing previews sit inside a bordered container.
- **Shadow Strategy:** Use depth for opened transient surfaces; keep the workspace flat.
- **Border:** A one-pixel rule separates the desktop panes and drawing actions.
- **Internal Padding:** Note rows have more breathing room than the compact navigation list.

### Inputs / Fields

- **Style:** Inputs use the theme's border and background roles; the search field sits on a muted fill.
- **Focus:** Focused fields use one foreground border without an outer ring. Compact picker inputs use a muted header fill for focus; the global search palette keeps its input on the flat dialog surface.
- **Error / Disabled:** Disabled controls reduce emphasis; destructive actions use the reserved semantic color.

### Navigation

Each workspace destination has a direct section URL. Refresh retains the section; Back/Forward follows accepted navigation while preserving the unsaved-edit guard. The desktop rail sits beside the note index. Search comes first, followed by Overview, Favorites, Notes, Journal, Tasks, Bookmarks, Artifacts, and Trash, with Quick pinned last above the footer; use the shared Lucide line-icon family throughout. Active and hovered destinations use quiet fills. Tablet removes the rail; mobile opens it in a side sheet through the content heading's navigation button. Settings sits in the rail footer beside the sidebar collapse control, with no avatar or account strip. Shortcut labels follow the platform: Ctrl, Alt and Shift on Windows and Linux; ⌘, ⌥ and ⇧ on Apple devices. Sign out is in Settings → Account, separate from signing out other sessions. Settings uses horizontal tabs with keyboard navigation rather than a vertical settings rail. Keep the settings content scrollable with hidden scrollbar chrome, and omit About and editable storage or file-size controls. Use styled shadcn controls, including a searchable language picker and confirmation dialog, instead of native menus or browser confirmation. Dropdown menus size to their labels within viewport bounds; action and selector labels stay on one line, with 36px rows on desktop and 44px touch targets on phones. Rich search results retain separate title and description rows.

### Overview

The Overview content heading leads into the live local date and time, quick actions, and task, note, and bookmark widgets. Keep the layout quiet and responsive, with navigation in the heading and no separate header bar.

### Search

The global search dialog uses the shared shadcn Dialog, Command, Button and Popover primitives. It opens from the rail or keyboard shortcut and owns its open state locally so opening it does not rerender the workspace or editor. Its width is at most 560px with 12px viewport margins; the results viewport stays at 352px or the smaller available height so incoming results do not shift the dialog. Keep the input flat against the dialog surface, with 14px desktop and 16px mobile text. Result icons, titles, excerpts and quiet type labels align in compact rows; long titles and excerpts truncate independently. Filter syntax lives in a contextual help popover. Escape dismisses help first and returns focus to the input; a second Escape closes search. Desktop has a quiet keyboard-hint footer; phones omit it and use 44px close/help targets. The search overlay has no backdrop blur. Loading disables stale results, and empty and retryable error states remain within the fixed viewport.

### Tasks

The dedicated task view keeps one inline creation form above Open and Completed filters with counts, then search and text-first rows. Both lists show newest-created tasks first; due dates remain optional row details and never change the list order. The desktop search stays compact; on mobile the toolbar stacks and search spans the content width. A checkbox completes or reopens each task, while title edits stay inline and deletion uses the styled confirmation dialog. Task text wraps anywhere; checkbox and row-action targets are 44px, and mobile editing actions remain touch-sized. Keep loading, retryable error, and empty states inside the same reading flow.

### Artifacts

The private shelf shares the Bookmarks content width, neutral surfaces, Geist typography and shadcn controls. Keep the introduction brief and the dashed Paste/Upload/Add text intake compact. Desktop type filters sit beside search; phones use the shared Select so four labels and counts do not wrap across multiple rows. Cards use the same grid and content hierarchy as Bookmarks: a consistent 4:3 preview frame and a 72px filename/action footer. At widths up to 480px use one readable column; wider phones/tablets use two, and desktop adapts to available width. Menus stay below the preview, with 44px targets. Never let an image's natural proportions stretch the shelf. The viewer has a fixed title/close header, a bounded scrolling body, and one action footer. All three share a 24px desktop / 16px mobile gutter. Viewer grids use `minmax(0, 1fr)`, filenames wrap within their column, and the editable title reserves the close target's space. Pasted text uses a fixed-height scrolling field; extracted text preserves spacing in a keyboard-focusable region. Mobile actions use equal columns with 44px targets. Read again stays beside the extracted-text heading. Preserve unsaved text when renaming and reset mutation state when changing viewer items; late extraction responses must not replace another open item. Audio/video use the shared player without an empty text-extraction section. Keep saving, extraction failure, retry and long-content states explicit and within viewport bounds.

### Code Language Picker

Use the shadcn Popover and Command pair with one search header. The menu is at most 280px wide and fits within 24px of the viewport width; its height stays within the available viewport. Options are 36px tall on desktop and 44px on mobile. Keep one keyboard-active option distinct from the check on the saved language.

### Brand Mark

The N monogram uses the foreground on a compact rounded square and reverses against the theme background. Reuse the shared local vector path across the branded app shell, favicon, and mobile icons. The public reader carries no Nivra name or mark; its metadata is limited to “Shared note” and the publication date.

### Writing Surface

The title field stays borderless and uses a muted surface fill with a small radius on keyboard focus instead of an outline. Its constant 12px horizontal padding extends into the writing gutter so the text stays aligned with the date, tags and body without shifting on focus. It uses the headline token at 26px on desktop and 24px on mobile; a ResizeObserver recalculates its height after available width changes so wrapped titles remain visible. Desktop BlockNote prose uses the 14px body token with 1.65 line spacing, while mobile prose returns to 16px for comfortable touch reading. Body headings follow the `editor-h1` through `editor-h6` tokens, with the mobile H5/H6 tokens, and remain scoped to note content, including nested content. The explicit sizes prevent headings from inheriting BlockNote’s 3em/2em multipliers. BlockNote blocks have 4px vertical padding, and editor source blocks use the 12px monospace token. The public reader retains 16px prose with 1.75 line spacing and its existing title and code sizes. Journal notes begin as blank pages and stay separate from Notes; template creation is removed. Formatting and slash-menu controls stay available through editor interactions. Do not add a bottom status strip or persistent insertion toolbar. The editor preserves the draft during save errors and keeps its save state close to the note.

### Public Reader and System Pages

The public reader presents the publication date, “Shared note” label, title, and semantic note content on a centered, responsive reading surface. It reads from the immutable published snapshot; syntax coloring and safe diagram rendering enhance the semantic fallback after load. Keep the reader unbranded. Not-found, loading, and error fallbacks use the same restrained neutral system-page treatment, with clear recovery actions where appropriate.

## Do's and Don'ts

### Do:

- **Do** keep navigation, the list, and the editor distinct with thin neutral separators.
- **Do** use the locally bundled Geist family for interface, titles, and prose.
- **Do** preserve visible keyboard focus and reduced-motion support.
- **Do** keep the named tag palette on owner-selected tag metadata; let drawings, diagrams, and syntax keep their own color.
- **Do** keep note actions touch-sized on narrow screens.
- **Do** let each note use its saved Standard or Wide writing width while preserving the responsive gutters and editor type ramp.

### Don't:

- **Don't** turn the writing workspace into a card dashboard or decorative landing hero.
- **Don't** add decorative gradients or a visible construction grid to the app chrome.
- **Don't** let application chrome compete with the note's content.
- **Don't** put the Nivra name or mark on the public reader; keep its metadata to “Shared note” and the publication date.

### Background completion states

Saved bookmarks show “Fetching preview…” while metadata is pending and retain a retry hint when unavailable. Artifact viewers show “Reading text…” until extraction completes; gallery cards keep processing details out of the filename view. Completion events refresh saved cards, viewers and search while preserving drafts and revision conflicts. Keep these states in existing card/detail layouts with neutral text and shared controls.

## Identity

The mark is a plain geometric N on a solid rounded square. The favicon, installed app icons, authentication screen and sidebar use the same paths from `src/lib/brand.mjs`. Generate SVG and PNG assets with `node scripts/build-icons.mjs`; installation, development and build commands also regenerate them. The interface mark follows the current monochrome theme; app icons use a white N on a black square.

Collection sections use the full workspace width with shared 40px desktop and 20px mobile gutters. Headings, forms, filters and result lists share those edges; search and row actions align to the right gutter even on wide desktops. Note writing and reading surfaces retain their separate width controls. Overview uses the full desktop content width: the date and clock align to the right of its heading from 1024px, and its three widgets share one row from 1280px. Smaller layouts retain the stacked clock and single-column cards.

Artifact galleries show a single filename (falling back to the saved title) with an image preview or centered file-type icon. Extracted text, search snippets, dates, sizes and processing metadata belong in the viewer. All artifact types share a 4:3 preview frame and a 72px filename footer with a 44px action menu. Images fit fully inside the frame without cropping; text and files use a centered type icon. The responsive grid keeps equal card heights and preserves DOM order. A compact list view uses 48px thumbnails or icons beside the filename and the same action menu. Grid is the desktop default; list is the default through 767px. The explicit choice is remembered locally, stays stable across filters and resizing, and synchronizes between open tabs. The Quick action uses the Lucide Zap icon and retains its existing shortcut and draft behavior.

Data loading uses the shared LoadingState component, with content-shaped skeletons for note lists, task and Trash rows, bookmark cards, the artifact grid or compact list, dashboard widgets and reading surfaces. Search and the artifact viewer use the same loading language. Skeletons announce one labeled busy status, use a quiet monochrome shimmer, and stop animation when reduced motion is requested. Loaded content stays visible during background reconciliation; saving, upload and other actions retain their own progress controls.

### Mobile navigation and launch

The mobile drawer is capped at 320px and leaves at least 48px of the underlying page visible. Its logo and close control share the header alignment. Navigation and tags scroll independently of Quick and Settings; safe-area padding protects the header and footer. Mobile actions have a minimum 44px touch height, keyboard shortcut hints are hidden, and closing the drawer returns keyboard focus to the navigation button without taking focus from another opened dialog.

Opening Nivra shows only the 64px N mark on the active theme's background until the initial account request resolves. There is no timed delay or decorative animation. Request failures replace the launch state with an explicit retry action. The same mark is used in generated iOS/iPadOS startup images; Android uses the manifest icon and launch background.

On viewports below 1024px, Search and Settings open as full-screen app pages at `/search` and `/settings`, with one back header, safe-area padding and independently scrolling content. Search omits desktop keyboard hints and reserves a 44px filter action. Settings keeps its shared tabs, account controls and protected security flows. Browser Back returns to the previous workspace destination; refresh preserves the open page. The workspace behind a mobile page is inert. Desktop keeps the centered dialogs and keyboard behavior.

Desktop Overview uses three equal-height columns fitted to the available workspace at widths of 1,024px or more and heights of 600px or more. Card headers and task summaries stay visible; their bounded lists contain up to 20 items and scroll independently. Short desktop windows use equal-height cards with compact lists and retain page scrolling so controls remain reachable. Phones keep five tasks, five notes and four bookmarks in a single scrolling column. Loading cards use the same fitted grid.

Desktop Search uses a 680px dialog within viewport gutters, a fixed result area through loading and empty states, and an opacity-only transition. The backdrop dims to 28% black in light mode and 55% in dark mode; mobile Search remains a full-screen page.

Vertical scrollbars are hidden across app sections, cards, editors, menus and mobile pages while native scrolling remains enabled. Collection panes and Overview lists provide named keyboard-focusable scroll regions. Horizontal scrollbars remain available for wide code, tables and diagrams. System forced-colors mode restores native scrollbars.

Selecting a sidebar tag opens a full-width collection of matching notes, journal entries, tasks, bookmarks and artifacts, with search and bounded pagination. Cards show item type, title, favorite state, edit date and tags; notes and bookmarks can include a short preview, while artifacts show their filename without extracted text. The collection has no creation actions; opening a card enters its existing section or viewer. The tag filter is retained in the URL across refresh. Notes and journals keep their editor tag controls; tasks, bookmarks and the artifact viewer use a shared tag picker with revision checks and explicit saving.

Favorites uses the same collection layout for starred notes, journal entries and bookmarks, with no creation controls. Notes invites writing a note; Journal uses journal-specific descriptions, search labels and a Create journal entry action that opens today's entry. Back controls name the originating collection.

Settings uses a fixed desktop dialog height with internal scrolling across Account and Import & export. Action confirmations stay beside their action; other feedback has clear spacing from fields. Search is a wider, taller results-only surface, showing recent items for an empty query and retaining the last query and results while reopening and refreshing. Mobile search and settings remain full-screen pages.

## Calendar

Calendar follows the workspace's monochrome controls and gutters. Desktop Month fills the remaining viewport height with six equal week rows; the page and month grid do not scroll. Shorter cells show fewer previews with an exact remaining-item count. The selected day's agenda scrolls independently. Year uses a four-column, three-row grid on desktop; Day and Week keep timed schedules within the content viewport. Mobile uses 44px date targets, a compact month grid followed by the selected day's agenda, and chronological lists for Day and Week. Event editors keep a stable desktop dialog height and become full-screen on mobile, with protected unsaved changes and safe-area controls.

Device reminder setup uses one optional, inline Overview callout with Enable notifications and Not now. It follows the content gutter, wraps actions on small screens, and keeps mobile targets at least 44px high. Dismissal is remembered per browser; permission prompts require an explicit click, and successful registration hides the callout.
