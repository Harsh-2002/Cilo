---
name: Cilo
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
    padding: "0 10px"
    typography: "{typography.button}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
    typography: "{typography.button}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
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

# Design System: Cilo

## Overview

**Creative North Star: "The Quiet Page"**

Cilo keeps the surrounding workspace quiet so the note remains the largest, clearest surface. Bundled Geist, neutral light and dark grounds, fine separators, and restrained controls give it the familiar Vercel-like shadcn character chosen for this build.

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

The desktop notes view uses a 216px navigation rail, a 300px searchable note list, and a fluid editor. Standard writing uses a centered 740px outer maximum with 44px horizontal gutters, leaving up to 652px for note content; its top gutter is 44px. Wide writing removes the outer maximum and fills the available editor pane while keeping the same gutters and type scale. Below 1100px the editor gutters reduce to 36px; below 1024px the Standard surface can grow to 760px as the rail becomes a drawer. At 767px and below, mobile shows either the list or open note with a visible back action, 26px writing gutters, a 24px editor title, and 16px prose. The mobile viewport resizes for the software keyboard so editing controls remain reachable. The note title, tags, save state, and note actions stay close to the writing surface; formatting and slash-menu controls remain available in the editor without a bottom status strip or persistent insertion toolbar. The labeled Page width choice is stored with each note.

The note list and note editor own their vertical scrolling inside the viewport. Onboarding and settings reuse the same typography, neutral borders, and theme roles rather than introducing another visual system. Settings sits in a centered 600px dialog with horizontal Appearance, Account, and Import & export tabs; its content scrolls without visible scrollbar chrome. The public reader uses responsive reading gutters and renders the immutable published snapshot as semantic HTML on each request. Its header contains only “Shared note” and the publication date, and code highlighting and diagram rendering load as enhancements.

Tasks is a separate view beside workspace navigation. Its text-first content sits in a centered 800px outer shell with 52px desktop and 20px mobile horizontal gutters; the header, inline creation form, status filters, search, task rows, and empty or error states stay within that pane.

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

The desktop rail sits beside the note index. Search comes first, followed by Overview, Favorites, Notes, Journal, Tasks, Bookmarks, Templates, and Trash; use the shared Lucide line-icon family throughout. Active and hovered destinations use quiet fills. Tablet removes the rail; mobile opens it in a side sheet, while the Overview keeps a navigation button visible above its content. Settings sits alone in the rail footer, with no avatar or account strip. Sign out is in Settings → Account, separate from signing out other sessions. Settings uses horizontal tabs with keyboard navigation rather than a vertical settings rail. Keep the settings content scrollable with hidden scrollbar chrome, and omit About and editable storage or file-size controls. Use styled shadcn controls, including a searchable language picker and confirmation dialog, instead of native menus or browser confirmation. Dropdown menus size to their labels within viewport bounds; action and selector labels stay on one line, with 36px rows on desktop and 44px touch targets on phones. Rich search results retain separate title and description rows.

### Overview

The Overview begins with the live local date and time, followed by quick actions and task, note, and bookmark widgets. It has no header bar or promotional headline or tagline. Keep the layout quiet and responsive, and retain the mobile navigation button.

### Search

The global search dialog uses the shared shadcn Dialog, Command, Button and Popover primitives. It opens from the rail or keyboard shortcut and owns its open state locally so opening it does not rerender the workspace or editor. Its width is at most 560px with 12px viewport margins; the results viewport stays at 352px or the smaller available height so incoming results do not shift the dialog. Keep the input flat against the dialog surface, with 14px desktop and 16px mobile text. Result icons, titles, excerpts and quiet type labels align in compact rows; long titles and excerpts truncate independently. Filter syntax lives in a contextual help popover. Escape dismisses help first and returns focus to the input; a second Escape closes search. Desktop has a quiet keyboard-hint footer; phones omit it and use 44px close/help targets. The search overlay has no backdrop blur. Loading disables stale results, and empty and retryable error states remain within the fixed viewport.

### Tasks

The dedicated task view keeps one inline creation form above Open and Completed filters with counts, then search and text-first rows. The desktop search stays compact; on mobile the toolbar stacks and search spans the content width. A checkbox completes or reopens each task, while title edits stay inline and deletion uses the styled confirmation dialog. Task text wraps anywhere; checkbox and row-action targets are 44px, and mobile editing actions remain touch-sized. Keep loading, retryable error, and empty states inside the same reading flow.

### Code Language Picker

Use the shadcn Popover and Command pair with one search header. The menu is at most 280px wide and fits within 24px of the viewport width; its height stays within the available viewport. Options are 36px tall on desktop and 44px on mobile. Keep one keyboard-active option distinct from the check on the saved language.

### Brand Mark

The folded-page C monogram uses the foreground on a compact rounded square and reverses against the theme background. Reuse the shared local vector path across the branded app shell, favicon, and mobile icons. The public reader carries no Cilo name or mark; its metadata is limited to “Shared note” and the publication date.

### Writing Surface

The title field stays borderless and uses a muted surface fill with a small radius on keyboard focus instead of an outline. It uses the headline token at 26px on desktop and 24px on mobile; a ResizeObserver recalculates its height after available width changes so wrapped titles remain visible. Desktop BlockNote prose uses the 14px body token with 1.65 line spacing, while mobile prose returns to 16px for comfortable touch reading. Body headings follow the `editor-h1` through `editor-h6` tokens, with the mobile H5/H6 tokens, and remain scoped to note content, including nested content. The explicit sizes prevent headings from inheriting BlockNote’s 3em/2em multipliers. BlockNote blocks have 4px vertical padding, and editor source blocks use the 12px monospace token. The public reader retains 16px prose with 1.75 line spacing and its existing title and code sizes. Daily Journal notes begin as blank pages; templates are optional and selected deliberately. Formatting and slash-menu controls stay available through editor interactions. Do not add a bottom status strip or persistent insertion toolbar. The editor preserves the draft during save errors and keeps its save state close to the note.

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
- **Don't** put the Cilo name or mark on the public reader; keep its metadata to “Shared note” and the publication date.
