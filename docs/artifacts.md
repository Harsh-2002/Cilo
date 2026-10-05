# Artifacts

Artifacts is a private shelf for material you want to keep without choosing folders or tags. Paste text or screenshots, drop a group of files, or use Upload. Text can be edited; originals are preserved for uploaded files. Title, filename and extracted content participate in full-text and typo-tolerant search, including global search with `type:artifact`.

Images in PNG, JPEG, WebP and valid static GIF formats are recognized by their bytes and read with bundled local English OCR. Text-based PDF, modern Office/OpenDocument files, common text/code formats, HTML/SVG/RTF text and ZIP filenames have bounded extraction. HTML/SVG and other active files download as opaque attachments and never execute in the viewer. Scanned PDFs, audio transcription, HEIC conversion and legacy binary Office extraction are not implemented. Unsupported files remain preserved and discoverable by their filenames.

Audio/video use the shared styled player when their format is recognized. Actual codec availability belongs to the browser: a saved file can remain downloadable even when its codec cannot play. Upload previews use browser-generated thumbnails where available, with a file card fallback.

SQLite and the configured file adapter preserve encrypted metadata/content, originals and thumbnails. Full-instance backups include the shelf. Note bundles retain their existing scope of notes and note attachments. Background recognition resumes pending items after restart; a failed extraction can be retried without re-uploading.

Limits: normal configured upload ceiling; 200,000 extracted/pasted characters; image OCR up to 60 million pixels with a 90-second recognition deadline; PDF embedded text up to 40 MiB and 400 pages; bounded Office/ODF decompression and ZIP listing. OCR is serialized to keep one local worker active. Upload and extraction still read files into memory; streaming media delivery remains a separate capability.
