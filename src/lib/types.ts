export type Document = { schemaVersion: 1; blocks: Record<string, unknown>[] };
export type Task = {
  id: string;
  title: string;
  completedAt: number | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  dueDate: string | null;
  recurrence: import("./dates").Recurrence | null;
  recurrenceDay: number | null;
  parentTaskId: string | null;
  noteId: string | null;
  noteTitle: string | null;
};
export type Note = {
  id: string;
  title: string;
  document: Document;
  text: string;
  revision: number;
  favorite: boolean;
  editorWidth: "standard" | "wide";
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  tags: Tag[];
  kind: "note";
  dailyDate: string | null;
};
export type NoteSummary = Omit<Note, "document">;
export type Tag = {
  id: string;
  name: string;
  color: import("./tags").TagColor;
};
export type Settings = {
  theme: "light" | "dark" | "system";
  uploadLimit: number;
  twoFactorEnabled?: boolean;
};
export type Publication = {
  token: string;
  revision: number;
  publishedAt: number;
};
export type Owner = { id: string; name: string; username: string };
export const emptyDocument: Document = {
  schemaVersion: 1,
  blocks: [{ type: "paragraph", content: [] }],
};
export type Bookmark = {
  id: string;
  url: string;
  title: string;
  description: string;
  siteName: string;
  collection: string;
  favorite: boolean;
  metadataStatus: "ready" | "unavailable";
  thumbnail: string | null;
  icon: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  noteId: string | null;
  noteTitle: string | null;
};
export type SearchResult = {
  id: string;
  type: "note" | "task" | "bookmark" | "artifact";
  title: string;
  excerpt: string;
  artifactKind?: "text" | "image" | "file";
  updatedAt: number;
  completed?: boolean;
  titleMatches?: import("./search-context").TextRange[];
  excerptMatches?: import("./search-context").TextRange[];
  matchTerms?: string[];
};
export type NoteVersion = {
  id: string;
  title: string;
  revision: number;
  createdAt: number;
  document?: Document;
};
export type Connections = {
  incoming: { id: string; title: string }[];
  outgoing: { id: string; title: string }[];
  tasks: { id: string; title: string; completed: boolean }[];
  bookmarks: { id: string; title: string; url: string }[];
};

export type Overview = {
  counts: { open: number; today: number; overdue: number };
  tasks: Pick<Task, "id" | "title" | "revision" | "dueDate" | "recurrence">[];
  notes: Pick<Note, "id" | "title" | "updatedAt">[];
  bookmarks: Pick<
    Bookmark,
    "id" | "title" | "url" | "description" | "siteName" | "updatedAt"
  >[];
  refreshedAt: number;
};
export type Page<T> = { items: T[]; next: string | null };
export type TaskFilter = "open" | "completed" | "today" | "upcoming";
export type Artifact = {
  id: string;
  kind: "text" | "image" | "file";
  title: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  preview: string;
  thumbnail: boolean;
  extraction: "none" | "pending" | "done" | "failed";
  revision: number;
  createdAt: number;
  updatedAt: number;
  excerpt?: string;
  excerptMatches?: import("./search-context").TextRange[];
};
export type ArtifactDetail = Artifact & { content: string };
