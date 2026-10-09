import { createHash } from "node:crypto";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "./pagination";
import { HttpError } from "./http";
export function offsetPagination(
  query: URLSearchParams,
  scope: string,
  maximum = 100,
) {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(maximum)
    .parse(query.get("limit") ?? 60);
  const stable = new URLSearchParams(query);
  stable.delete("after");
  stable.delete("offset");
  stable.sort();
  const fingerprint = createHash("sha256")
    .update(scope + "?" + stable)
    .digest("hex")
    .slice(0, 24);
  const parts = decodeCursor(query.get("after"), ["number", "string"]);
  if (parts && parts[1] !== fingerprint)
    throw new HttpError(400, "This cursor belongs to a different query.");
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .parse(parts?.[0] ?? query.get("offset") ?? 0);
  return {
    limit,
    offset,
    cursor(nextOffset: number) {
      return encodeCursor([nextOffset, fingerprint]);
    },
    page<T>(rows: T[], total?: number) {
      const items = rows.slice(0, limit);
      const hasMore =
        total === undefined
          ? rows.length > limit
          : offset + items.length < total;
      return {
        items,
        next: hasMore
          ? encodeCursor([offset + items.length, fingerprint])
          : null,
        nextOffset: hasMore ? offset + items.length : null,
        ...(total === undefined ? {} : { total }),
      };
    },
  };
}
