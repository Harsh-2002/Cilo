import { z } from "zod";
import { validDate } from "../dates";
export const calendarDate = z
  .string()
  .refine(validDate, "Choose a valid calendar date (YYYY-MM-DD).");
export const taskSchedule = {
  dueDate: calendarDate.nullable().optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  noteId: z.string().uuid().nullable().optional(),
};
export const credentials = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_.]{3,30}$/),
  password: z.string().min(12).max(128),
});
export const setupInput = credentials.extend({
  name: z.string().trim().min(1).max(80),
  theme: z.enum(["light", "dark", "system"]).default("system"),
});
const blockTypes = new Set([
  "audio",
  "bulletListItem",
  "checkListItem",
  "codeBlock",
  "divider",
  "file",
  "heading",
  "image",
  "numberedListItem",
  "paragraph",
  "quote",
  "table",
  "toggleListItem",
  "video",
  "diagram",
  "canvas",
]);
export const documentInput = z
  .object({
    schemaVersion: z.literal(1),
    blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(10000),
  })
  .superRefine((document, ctx) => {
    let count = 0;
    const visit = (blocks: Record<string, unknown>[], depth: number) => {
      if (depth > 30 || (count += blocks.length) > 10000) {
        ctx.addIssue({
          code: "custom",
          message:
            "This document is too deeply nested or contains too many blocks.",
        });
        return;
      }
      for (const block of blocks) {
        if (
          block.id !== undefined &&
          (typeof block.id !== "string" ||
            !/^[a-zA-Z0-9_-]{1,128}$/.test(block.id))
        )
          ctx.addIssue({
            code: "custom",
            message: "This document contains an invalid block identifier.",
          });
        if (
          block.type !== undefined &&
          (typeof block.type !== "string" || !blockTypes.has(block.type))
        )
          ctx.addIssue({
            code: "custom",
            message: "This document contains an unsupported block type.",
          });
        if (block.type === "canvas") {
          try {
            const scene = (block.props as { scene?: string } | undefined)
              ?.scene;
            if (scene) {
              const data = JSON.parse(scene);
              if (!Array.isArray(data.elements) || data.elements.length > 10000)
                throw new Error();
            }
          } catch {
            ctx.addIssue({
              code: "custom",
              message: "This drawing contains invalid scene data.",
            });
          }
        }
        if (block.children !== undefined) {
          if (
            !Array.isArray(block.children) ||
            block.children.some(
              (b) => !b || typeof b !== "object" || Array.isArray(b),
            )
          )
            ctx.addIssue({ code: "custom", message: "Invalid nested blocks." });
          else visit(block.children, depth + 1);
        }
      }
    };
    visit(document.blocks, 0);
  });
export const noteInput = z.object({
  title: z.string().max(300).optional(),
  document: documentInput.optional(),
  favorite: z.boolean().optional(),
  editorWidth: z.enum(["standard", "wide"]).optional(),
  trashed: z.boolean().optional(),
  tags: z.array(z.string().uuid()).max(100).optional(),
  revision: z.number().int().positive(),
});
export function plainText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value))
    return value.map(plainText).filter(Boolean).join("\n");
  const item = value as Record<string, unknown>;
  const parts = [
    typeof item.text === "string" ? item.text : "",
    typeof item.content === "string" ? item.content : plainText(item.content),
    plainText(item.children),
  ];
  if (item.type === "canvas" && item.props && typeof item.props === "object") {
    try {
      const scene = JSON.parse((item.props as { scene: string }).scene);
      parts.push(
        ...(scene.elements || []).map((e: { text?: string }) => e.text || ""),
      );
    } catch {}
  }
  return parts.filter(Boolean).join("\n");
}
export function ftsQuery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 20)
    .map((word) => `"${word.replaceAll('"', '""')}"*`)
    .join(" AND ");
}
