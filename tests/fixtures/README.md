# Synthetic extraction and media fixtures

These files contain fabricated test content, not owner data. The OCR image was authored in a browser canvas with the sample invoice text used in the tests. JPEG/WebP were exported from that image in canvas; the static GIF uses a two-color palette and valid LZW clear codes. The PDF was printed from synthetic HTML in Chromium and contains the test phrases ZX-4400 and ZX-4401.

The media fixtures are generated locally, without a sourced clip: a two-second 440 Hz sine wave and a 160×90 white video frame. FFmpeg created PCM WAV, MP3, AAC/M4A, Vorbis/Ogg, FLAC, H.264/AAC MP4 and VP9/Opus WebM variants. FFmpeg is a test-fixture authoring tool, not an application runtime dependency. The test matrix also contains deliberately synthetic headers for unsupported/legacy format classification; those header-only cases do not establish playback.

The files are excluded from the standalone shipping artifact. Tests assert original-byte preservation, bounded extraction/search behavior, safe file serving and real playback of the supported media fixtures in the scoped browser run.
