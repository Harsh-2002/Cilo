import { createHash } from "node:crypto";
import { z } from "zod";
import { sqlite } from "./db";
import { HttpError } from "./http";
export async function retryable<T>(
  connection: string,
  key: string | undefined,
  operation: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!key) return run();
  z.string()
    .min(8)
    .max(128)
    .regex(/^[\x21-\x7e]+$/)
    .parse(key);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(operation))
    .digest("hex");
  const database = sqlite();
  const existing = database
    .prepare(
      "SELECT fingerprint,result FROM agent_idempotency WHERE connection_id=? AND request_key=? AND expires_at>?",
    )
    .get(connection, key, Date.now()) as
    { fingerprint: string; result: string | null } | undefined;
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new HttpError(
        409,
        "This idempotency key was used for different input.",
      );
    if (!existing.result)
      throw new HttpError(
        409,
        "This operation is still running. Retry shortly.",
      );
    return JSON.parse(existing.result) as T;
  }
  database
    .prepare("DELETE FROM agent_idempotency WHERE expires_at<=?")
    .run(Date.now());
  try {
    database
      .prepare("INSERT INTO agent_idempotency VALUES(?,?,?,?,?)")
      .run(connection, key, fingerprint, null, Date.now() + 86400000);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code).startsWith("SQLITE_CONSTRAINT")
    )
      throw new HttpError(
        409,
        "This operation was claimed by another request. Retry shortly.",
      );
    throw error;
  }
  try {
    const result = await run();
    database
      .prepare(
        "UPDATE agent_idempotency SET result=? WHERE connection_id=? AND request_key=?",
      )
      .run(JSON.stringify(result), connection, key);
    return result;
  } catch (error) {
    database
      .prepare(
        "DELETE FROM agent_idempotency WHERE connection_id=? AND request_key=?",
      )
      .run(connection, key);
    throw error;
  }
}
