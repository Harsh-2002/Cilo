export type Document = { schemaVersion: 1; blocks: Record<string, unknown>[] };
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
export type Tag = { id: string; name: string };
export type Settings = {
  theme: "light" | "dark" | "system";
  uploadLimit: number;
};
export type Owner = { id: string; name: string; username: string };
export const emptyDocument: Document = {
  schemaVersion: 1,
  blocks: [{ type: "paragraph", content: [] }],
};
