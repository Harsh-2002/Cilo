export type Document = { schemaVersion: 1; blocks: Record<string, unknown>[] };
export type Task = {
  id: string;
  title: string;
  completedAt: number | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
export type Note = {
  id: string;
  title: string;
  document: Document;
  text: string;
  revision: number;
  favorite: boolean;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  tags: Tag[];
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
