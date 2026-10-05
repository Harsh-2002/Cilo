import { HttpError } from "./http";
export const pageSize = { default: 60, max: 100 };
export function pageLimit(value: string | null) {
  return Math.max(
    1,
    Math.min(pageSize.max, Math.trunc(Number(value)) || pageSize.default),
  );
}
export function encodeCursor(parts: (string | number)[]) {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}
export function decodeCursor(
  value: string | null,
  kinds: ("string" | "number")[],
) {
  if (!value) return undefined;
  try {
    const parts: unknown = JSON.parse(
      Buffer.from(value.slice(0, 400), "base64url").toString(),
    );
    if (
      Array.isArray(parts) &&
      parts.length === kinds.length &&
      parts.every((part, index) => typeof part === kinds[index])
    )
      return parts as (string | number)[];
  } catch {}
  throw new HttpError(400, "This page position is no longer valid.");
}
