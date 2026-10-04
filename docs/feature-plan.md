# Connected workspace implementation plan

Scope approved by the owner: unified search, note history, internal links and backlinks, task dates and recurrence, daily notes and templates. Preserve the existing monochrome shadcn interface, single-owner authorization, mandatory encryption, SQLite, local/hybrid file storage and portable recovery.

## Direction contract

THESIS: connect the owner's existing writing and actions through contextual controls; everyday writing retains the established composition.

OWN-WORLD: inherit DESIGN.md's Geist typography, neutral monochrome surfaces, quiet separators and shadcn controls in both themes. The owner uses the same workspace at a desk and on a phone.

STORY: capture a note, connect an idea, find a saved item, schedule its next action and recover an edit without learning a second interface.

FIRST VIEWPORT: Search and Today join existing navigation. Templates reuse the note list. The editor keeps its title and content dominant; history remains in Note actions and related items collapse below writing. Task scheduling appears only while editing.

FORM: code-led extensions of the approved workspace; no visual-world replacement or concept seed applies. The signature interaction is opening a stable note connection through the existing save guard, with restrained menu/dialog transitions and brief fades under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Interaction contract

- **Search:** a visible Search action and Ctrl/Cmd K open one keyboard-operable dialog from every section. Results distinguish notes, tasks and bookmarks; `type:` and `tag:` narrow results. Creation commands navigate through the existing unsaved-change guard. Local section search remains available.
- **History:** Note actions opens version history with dated checkpoints and a read-only rich preview. Restoring requires confirmation and the current revision; first preserve the current content as a recoverable version. Coalesce autosave checkpoints into five-minute editing windows and retain the latest 100 checkpoints per note. Attachment references remain recoverable until permanent note deletion.
- **Connections:** `[[` suggests saved notes and inserts a normal Markdown-compatible link using its stable ID. Opening it respects unsaved changes. Related notes, linked tasks and linked bookmarks appear beneath the editor, collapsed by default. Deleted/trashed targets are explicitly unavailable; published snapshots do not expose private navigation links. Tasks and bookmarks may each link to a note through a shared picker.
- **Tasks:** retain title-only quick creation. Editing exposes an optional date and daily/weekly/monthly recurrence through authored controls. Open, Today, Upcoming and Completed views handle overdue dates clearly. Completing a recurring occurrence creates the next open occurrence atomically; retrying a stale revision cannot create duplicates. Dates are calendar dates, interpreted in the owner's browser timezone, without notification scheduling.
- **Daily notes and templates:** Today opens or creates one note for the browser's local calendar day. Templates live in the existing note-list/editor layout, include editable meeting/journal/project starting points, and support saving a note as a template. Instantiation copies attachments and remaps IDs; editing a template cannot change existing notes. A chosen template can seed a daily note. Daily uniqueness is enforced in SQLite.

## Data and delivery

Add an ordered migration for history, stable note connections, task scheduling, template/daily identity and task FTS5. Backfill existing searchable task titles. Keep old notes/tasks/bookmarks valid. Extend lossless bundles to preserve the new content and relationships with ID remapping; accept previous bundle versions. Encrypted instance backups retain the entire schema and every referenced attachment.

## Verification

Test migration of an existing encrypted database; search filters/typos/private authorization; history restore/conflicts/retention; link extraction/rename/trash behavior; recurrence calendar boundaries and duplicate completion; daily creation races; custom template attachment isolation; bundle round trips and encrypted backup recovery. Run typecheck, lint, format, tests and a production build. Verify actual keyboard and touch interactions in Chromium at 1440, 768, 390 and 320 pixels in both themes, including dialog overflow and errors. Repeat S3 writes/recovery against the disposable RustFS 1.0.1 container. Physical devices and other browser engines remain separately scoped checks.

## Implementation order

1. Schema and server behavior, then integration tests.
2. Shared search/note/date controls and workspace navigation.
3. History, connections, scheduling and template flows.
4. Portable export/import and documentation.
5. Production browser/storage checks, independent Impeccable finish review and verified direct-main delivery.
