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

The desktop workspace places navigation, a searchable note index, and a fluid editor side by side. On smaller screens, the app changes which pane is visible to protect the writing area. Color stays with user-authored drawings, diagrams, and highlighted code, with semantic color reserved for destructive actions.

**Key Characteristics:**

- Writing stays visually dominant inside the workspace.
- Neutral surfaces, thin separators, and compact controls organize the app.
- Color belongs to note artifacts or a clear semantic action.

## Colors

The interface uses a restrained grayscale palette in both themes; color is carried by note content and semantic states.

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

### Named Rules

**The Content-Color Rule.** Keep normal workspace chrome neutral; let color arrive inside the owner's drawings, diagrams, and highlighted code, with semantic destructive coloring confined to that action state.

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

The note list and note editor own their vertical scrolling inside the viewport. Onboarding and settings reuse the same typography, neutral borders, and theme roles rather than introducing another visual system.

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

- **Style:** Tags use a compact muted fill, quiet text, and a small radius.
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

The desktop rail sits beside the note index. Active and hovered destinations use quiet fills. Tablet removes the rail; mobile opens it in a side sheet. Mobile note view keeps a visible back action.

### Writing Surface

The title field has a borderless treatment but retains visible keyboard focus. BlockNote prose stays on the shared sans family, while source blocks use monospace. The editor preserves the draft during save errors and uses a visible save state; those interaction states stay close to the note rather than moving into a separate dashboard.

## Do's and Don'ts

### Do:

- **Do** keep navigation, the list, and the editor distinct with thin neutral separators.
- **Do** use the locally bundled Geist family for interface, titles, and prose.
- **Do** preserve visible keyboard focus and reduced-motion support.
- **Do** let drawings, diagrams, and syntax keep their own color.
- **Do** keep note actions touch-sized on narrow screens.

### Don't:

- **Don't** turn the writing workspace into a card dashboard or decorative landing hero.
- **Don't** add decorative gradients or a visible construction grid to the app chrome.
- **Don't** let application chrome compete with the note's content.
