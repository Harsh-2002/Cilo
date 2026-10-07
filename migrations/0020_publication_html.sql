CREATE TABLE publication_pages (token TEXT PRIMARY KEY NOT NULL REFERENCES publications(token) ON DELETE CASCADE, html TEXT NOT NULL, renderer_version TEXT NOT NULL);
