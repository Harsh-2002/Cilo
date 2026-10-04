# Search, history and connected notes

These features extend the existing notes, tasks and bookmarks workspace. SQLite remains local in both storage modes; mandatory encryption also covers the new records and their recovery backups.

## Search everything

Choose **Search** or press Ctrl/Cmd K from any section. Results include notes, tasks and bookmarks. Prefix and close-spelling matching use each section's SQLite FTS5 index. Use `type:note`, `type:task` or `type:bookmark` to narrow results; `tag:work` or `tag:"project ideas"` restricts matching notes to a tag. Trashed notes and templates do not appear in global results. Creation actions open a new note, task, bookmark or today's note through the same unfinished-edit guard as ordinary navigation.

Section search remains available. Search does not extract text from PDFs, images or videos.

## Version history

Choose **Note actions → Version history** to preview earlier content and restore it. Before a content change, Cilo keeps a checkpoint at most once per five-minute editing window and retains the latest 100 checkpoints per note. These are editing checkpoints, rather than every keystroke or every autosave.

Restoration preserves the current content first, checks the current revision and replaces the title and document. Tags, favorites and daily identity stay attached to the note. Restore a trashed note before restoring its history. Attachments belonging to the note remain available to older versions until permanent note deletion.

## Links and related items

Type `[[` in the editor to choose an existing note. The inserted link uses a stable note ID and works with Markdown export. Renaming the target keeps the link valid; its original inline label remains editable text.

Expand **Related items** below the editor to see outgoing links, backlinks, linked tasks and linked bookmarks. Opening a link respects unfinished edits. A trashed or deleted note cannot be opened through private navigation. Public snapshots remove private navigation links.

When editing a task or bookmark, use **Linked note** to associate it with a note. Removing the association does not delete either item. Opening a note directly with `/?note=<id>` still requires authentication.

## Task dates and recurrence

Quick creation still needs only a title. **Edit task** adds an optional calendar date, recurrence and linked note. The calendar includes a YYYY-MM-DD input and authored date controls; it does not use a browser-native date menu.

**Today** includes overdue and current-day open tasks. **Upcoming** contains future open tasks. **Completed** shows completed occurrences. Dates use the browser's local calendar day.

Completing a daily, weekly or monthly task creates one next open occurrence with the same title and note association. Daily adds one day, weekly adds seven days, and monthly preserves the original day with end-of-month clamping. A January 31 series continues on February 28 and March 31. Reopening and completing an earlier occurrence again does not duplicate its already-created successor. Recurrence advances from the occurrence's date, rather than the date you happened to complete it. It does not send reminders or run a notification scheduler.

## Daily notes and templates

**Today** opens or creates one note for the browser's local calendar day. Returning to it reuses that note. If it is in Trash, restore it before opening that day again.

**Templates** uses the regular list and editor. Journal, Meeting and Project are editable starting points, created once per installation. Create a blank template or choose **Save as template** from a note's actions. **Create note from template** makes an independent note with its own copied attachments. Later template edits do not change existing notes.

**Use for daily notes** sets the starting point for future daily notes. It does not replace today's existing content. Journal is the initial default. Templates can be trashed and restored through Trash.

## Portability

Version-two Cilo bundles preserve histories, templates, daily dates, internal links, task dates/series and note associations. Import remaps note, task and attachment IDs; version-one bundles remain accepted. If a daily date already exists, its imported content becomes a regular note and the UI reports that adjustment. Existing bookmark URLs remain deduplicated without overwriting their local details.

Bundles import content into an existing owner account. Full encrypted instance backups also preserve account state, publications, chosen daily template and instance preferences, and recover only into a new or empty directory with the original key. See [self-hosting and recovery](self-hosting.md).
