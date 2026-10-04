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
    fontSize: "32px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  headline-mobile:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "29px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  body:
    fontFamily: '"Geist Variable", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
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
    fontSize: "13px"
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

- **Headline:** Use the headline token for note titles; it steps down on narrow mobile screens.
- **Body:** The body token governs BlockNote prose and its comfortable line spacing.
- **Interface:** The interface token sets the compact application baseline.
- **Button:** A slightly stronger interface weight marks actions without changing the family.
- **Navigation and labels:** Smaller roles support note counts, timestamps, navigation, and tags.
- **Code:** A system monospace stack separates source blocks from prose.

## Layout

Desktop uses a 216px navigation rail, a 300px searchable note list, and a fluid editor. The writing surface has an 800px outer maximum with 52px horizontal gutters, leaving up to 696px for note content. At widths below 1100px the list narrows and editor gutters reduce; below 1024px the desktop rail becomes a drawer. At 767px and below, mobile shows either the list or the open note with a visible back action. The mobile viewport resizes for the software keyboard so editing controls remain reachable. The note title, tags, save state, and artifact actions stay close to the writing surface.

The note list and note editor own their vertical scrolling inside the viewport. Onboarding and settings reuse the same typography, neutral borders, and theme roles rather than introducing another visual system. Settings sits in a centered 600px dialog with horizontal Appearance, Account, and Import & export tabs; its content scrolls without visible scrollbar chrome. Publishing preview and the read-only public reader use a centered 800px shell with responsive gutters and the same quiet reading surface.

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
- **Hover / Focus:** Buttons make a small active press shift. Keyboard focus uses a visible neutral outline and component focus ring.
- **Touch use:** Note-topbar and insertion-toolbar actions reach a 44px control height on mobile.

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
- **Focus:** Keyboard focus remains visible with a neutral outline and the component ring.
- **Error / Disabled:** Disabled controls reduce emphasis; destructive actions use the reserved semantic color.

### Navigation

The desktop rail sits beside the note index. Active and hovered destinations use quiet fills. Tablet removes the rail; mobile opens it in a side sheet. Mobile note view keeps a visible back action. Settings uses horizontal tabs with keyboard navigation rather than a vertical settings rail. Keep the settings content scrollable with hidden scrollbar chrome, and omit About and editable storage or file-size controls. Use styled shadcn controls, including a searchable language picker and confirmation dialog, instead of native menus or browser confirmation.

### Tasks

The dedicated task view keeps one inline creation form above Open and Completed filters with counts, then search and text-first rows. The desktop search stays compact; on mobile the toolbar stacks and search spans the content width. A checkbox completes or reopens each task, while title edits stay inline and deletion uses the styled confirmation dialog. Task text wraps anywhere; checkbox and row-action targets are 44px, and mobile editing actions remain touch-sized. Keep loading, retryable error, and empty states inside the same reading flow.

### Code Language Picker

Use the shadcn Popover and Command pair with one search header. The menu is at most 280px wide and fits within 24px of the viewport width; its height stays within the available viewport. Options are 36px tall on desktop and 44px on mobile. Keep one keyboard-active option distinct from the check on the saved language.

### Brand Mark

The folded-page C monogram uses the foreground on a compact rounded square and reverses against the theme background. Reuse the shared local vector path across the branded app shell, favicon, and mobile icons. The public reader carries no Cilo name or mark; its metadata is limited to “Shared note” and the publication date.

### Writing Surface

The title field stays borderless and uses a muted surface fill with a small radius on keyboard focus instead of an outline. A ResizeObserver recalculates its height after available width changes so wrapped titles remain visible. BlockNote prose stays on the shared sans family, while source blocks use monospace. The editor preserves the draft during save errors and uses a visible save state; those interaction states stay close to the note rather than moving into a separate dashboard.

## Do's and Don'ts

### Do:

- **Do** keep navigation, the list, and the editor distinct with thin neutral separators.
- **Do** use the locally bundled Geist family for interface, titles, and prose.
- **Do** preserve visible keyboard focus and reduced-motion support.
- **Do** keep the named tag palette on owner-selected tag metadata; let drawings, diagrams, and syntax keep their own color.
- **Do** keep note actions touch-sized on narrow screens.

### Don't:

- **Don't** turn the writing workspace into a card dashboard or decorative landing hero.
- **Don't** add decorative gradients or a visible construction grid to the app chrome.
- **Don't** let application chrome compete with the note's content.
- **Don't** put the Cilo name or mark on the public reader; keep its metadata to “Shared note” and the publication date.
