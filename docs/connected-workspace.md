# Search, history and connected notes

These features extend the existing notes, tasks and bookmarks workspace. SQLite remains local in both storage modes; the persisted default-on encryption mode also covers these records. Recovery backups remain encrypted in either mode; see [startup configuration](self-hosting.md#encryption-and-key-custody).

## Search everything

Choose **Search** or press Ctrl/Cmd K from any section. Results include notes, tasks and bookmarks. Prefix and close-spelling matching use each section's SQLite FTS5 index. Use `type:note`, `type:task` or `type:bookmark` to narrow results; `tag:work` or `tag:"project ideas"` restricts matching notes to a tag. Trashed notes and templates do not appear in global results. Creation actions open a new note, task, bookmark or journal through the same unfinished-edit guard as ordinary navigation.

The search dialog keeps a stable results viewport and preserves results during debounced requests. Opening it updates only the search component, so the editor does not rerender. Section search remains available. Search does not extract text from PDFs, images or videos.

## Quick capture

Choose **Capture** in navigation, **Note actions → Quick capture**, or press **Ctrl/Cmd Shift Enter**. Save a note, task or link in the compact dialog while keeping the current section and unfinished edits. Pasting one HTTP(S) URL automatically suggests Link; an explicit Note/Task/Link choice takes precedence. Save with the button or **Ctrl/Cmd Enter**.

Notes use the first non-empty line as a title and retain the entered text as paragraphs, ready for rich editing. Tasks have a 300-character title limit. Links use the existing protected metadata fetch and fallback cards. Closing the dialog retains its draft in the current browser session; failed saves retain it and show an error. This draft is in memory, not durable offline storage: reloading or closing the tab can discard it.

Global search shows a matching passage and highlights actual FTS matches, including corrected typo matches. Selecting a note result scrolls to a relevant block and focuses the editor when the excerpt matches body content; title-only matches open the note normally. Nested content is searched independently from its parent. Highlights remain neutral and do not modify the saved document.

## Version history

Choose **Note actions → Version history** to preview earlier content and restore it. Before a content change, Nivra keeps a checkpoint at most once per five-minute editing window and retains the latest 100 checkpoints per note. These are editing checkpoints, rather than every keystroke or every autosave.

Restoration preserves the current content first, checks the current revision and replaces the title and document. Tags, favorites and daily identity stay attached to the note. Restore a trashed note before restoring its history. Attachments belonging to the note remain available to older versions until permanent note deletion.

## Links and related items

Type `[[` in the editor to choose an existing note. The inserted link uses a stable note ID and works with Markdown export. Renaming the target keeps the link valid; its original inline label remains editable text.

Expand **Related items** below the editor to see outgoing links, backlinks, linked tasks and linked bookmarks. Opening a link respects unfinished edits. A trashed or deleted note cannot be opened through private navigation. Public snapshots remove private navigation links.

When editing a task or bookmark, use **Linked note** to associate it with a note. Removing the association does not delete either item. Opening a note directly with `/?note=<id>` still requires authentication.

## Task dates and recurrence

Quick creation still needs only a title. **Edit task** adds an optional calendar date, recurrence and linked note. The calendar includes a YYYY-MM-DD input and authored date controls; it does not use a browser-native date menu.

**Today** includes overdue and current-day open tasks. **Upcoming** contains future open tasks. **Completed** shows completed occurrences. Dates use the browser's local calendar day.

Completing a daily, weekly or monthly task creates one next open occurrence with the same title, tags and note association. Daily adds one day, weekly adds seven days, and monthly preserves the original day with end-of-month clamping. A January 31 series continues on February 28 and March 31. Reopening and completing an earlier occurrence again does not duplicate its already-created successor. Recurrence advances from the occurrence's date, rather than the date you happened to complete it. It does not send reminders or run a notification scheduler.

## Journal

**Journal** is its own section, separate from Notes. It lists one entry per day, newest first. The **+** button (or **Write today’s entry**) opens or creates one blank entry for the browser's local calendar day, and returning to it reuses that entry. Journal entries are ordinary notes with a date, so they have history, tags, favorites, attachments and sharing, but they do not appear in the Notes list; tag views and global search include them. If an entry is in Trash, restore it before opening that day again.

Templates were removed. Migration 0013 moves any existing template notes to Trash rather than deleting them, so they can be restored as ordinary notes or deleted from there. Older bundles that contain templates import them into Trash as ordinary notes.

## Portability

Version-four Nivra bundles preserve boards, archive state, task membership/stages/positions, histories, journal dates, internal links, task dates/series and note associations and task/bookmark tags. Import remaps note, task and attachment IDs; versions one through three remain accepted. If a daily date already exists, its imported content becomes a regular note and the UI reports that adjustment. Existing bookmark URLs remain deduplicated without overwriting their local details.

Bundles import content into an existing owner account. Full encrypted instance backups also preserve account state, publications and instance preferences, and recover only into a new or empty directory with the original key. See [self-hosting and recovery](self-hosting.md).

## Overview

Overview is the first navigation section and the default landing view after signing in. It shows your device’s full local date and year, a clock updated at each minute, open tasks, recent notes, and recent bookmarks. Recent notes exclude templates and trash.

Tasks show the total open count, due-today and overdue counts, and up to twenty open tasks ordered by due date; undated tasks come last. Complete a task directly from Overview, including recurring tasks. Selecting a task opens Tasks with its title as the search query; selecting a note opens its editor. Bookmark links open the saved website in a new tab. View all clears any previous section search.

Quick actions create a note, focus the task or bookmark creation field, or open journal. Desktop shows three equal-height cards with up to twenty items each and scrolling inside the lists; phones show five tasks, five notes and four bookmarks. The overview updates after task completion, shared completion/resync events and returning to the tab or window. Hidden tabs close the shared stream and suspend the clock timer. Failed refreshes preserve the last loaded items and offer a retry. Overview uses the existing authenticated, uncached API and stores no separate dashboard data.

## Writing width

Choose **Note actions → Page width → Standard / Wide**. Standard keeps the centered reading measure; Wide fills the available editor pane with the same responsive gutters. The choice belongs to each note, saves through the normal revision-aware autosave, and survives reload, duplication, lossless bundles. Existing notes default to Standard. Both modes use the same compact heading hierarchy; mobile layouts remain bounded by the screen. Public sharing retains its independent reading layout.

## Tags

Assign tags in note and journal editors, the Tags control on task and bookmark rows, or Tags in an artifact viewer. Select multiple existing tags and save. Clicking a sidebar tag opens all related item types together, with search and Load more. This collection has no creation controls. Tags remain attached in Trash and return on restoration.

## Favorites

Favorites collects starred notes, journal entries and bookmarks into searchable cards. Open a card to return to its editor or section. The collection has no creation action; create content in its own section or Quick. Refresh retains the Favorites route.

## Calendar

Use Calendar for dated tasks and events, with month, week, day and year views. Events support linked notes and other items, tags, recurrence and reminders. Open an existing event to read its details, then choose Edit to change it. Enable notifications per device under Settings → Account; installed iPhone PWAs and supported desktop browsers can receive backend reminders while the app is closed. Availability depends on the browser's push service.

## Kanban

Tasks supports List and Board views. Create a named board and move tasks through To do, In progress and Done; existing tasks can be assigned to a board without being duplicated. Desktop shows the columns together, while phones use stage tabs. Task dates, recurrence, tags and reminders remain available. Archive or reopen a board through its menu. Board, view and stage selections are reflected in the URL. MCP tools can create and update boards, list their tasks and move cards.
