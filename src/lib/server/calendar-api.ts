import { z } from "zod";
import {
  calendarRange,
  createEvent,
  getEvent,
  eventLinks,
  updateEvent,
  trashEvent,
} from "./calendar";
import { eventInput, dateSchema, zoneSchema } from "../calendar";
import { json, response, HttpError } from "./http";
import {
  pushKeys,
  testDeviceReminder,
  saveSubscription,
  removeSubscription,
  reminderList,
  invalidateCalendarReminders,
} from "./calendar-reminders";
import { sqlite } from "./db";
const scopeInput = z.object({
  revision: z.number().int().positive(),
  scope: z.enum(["series", "occurrence", "following"]).default("series"),
  occurrence: z.string().max(40).optional(),
});
export async function calendarApi(
  request: Request,
  owner: string,
  session: string | null,
  path: string[],
) {
  const [, area, id] = path,
    method = request.method,
    url = new URL(request.url);
  if (area === "range" && method === "GET") {
    const v = z
      .object({
        from: dateSchema,
        to: dateSchema,
        timezone: zoneSchema,
        mode: z.enum(["planning", "activity"]).default("planning"),
        includeCompleted: z
          .enum(["1", "0"])
          .default("1")
          .transform((v) => v === "1"),
        preview: z.coerce.number().int().min(0).max(50).default(0),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
        limit: z.coerce.number().int().min(1).max(10000).default(500),
        tag: z.string().uuid().optional(),
        query: z.string().max(300).optional(),
      })
      .parse(Object.fromEntries(url.searchParams));
    return response(calendarRange(owner, v.from, v.to, v.timezone, v));
  }
  if (area === "events") {
    if (method === "GET" && id)
      return response({
        ...getEvent(owner, id),
        linkedItems: eventLinks(owner, id),
      });
    if (method === "POST" && !id) {
      const value = createEvent(owner, await json(request));
      invalidateCalendarReminders();
      return response(value, 201);
    }
    if (id && method === "PATCH") {
      const body = z
        .object({ input: eventInput, ...scopeInput.shape })
        .strict()
        .parse(await json(request));
      const value = updateEvent(
        owner,
        id,
        body.revision,
        body.input,
        body.scope,
        body.occurrence,
      );
      invalidateCalendarReminders();
      return response(value);
    }
    if (id && method === "DELETE") {
      const body = scopeInput.strict().parse(await json(request));
      const value = trashEvent(
        owner,
        id,
        body.revision,
        body.scope,
        body.occurrence,
      );
      invalidateCalendarReminders();
      return response(value);
    }
  }
  if (area === "task-reminders" && id && method === "GET") {
    if (
      !sqlite()
        .prepare(
          "SELECT 1 FROM tasks WHERE id=? AND owner_id=? AND trashed_at IS NULL",
        )
        .get(id, owner)
    )
      throw new HttpError(404, "This task was not found.");
    return response(
      (
        sqlite()
          .prepare(
            "SELECT field,timezone,offsets FROM calendar_task_reminders WHERE task_id=?",
          )
          .all(id) as { field: string; timezone: string; offsets: string }[]
      ).map((row) => ({ ...row, offsets: JSON.parse(row.offsets) })),
    );
  }
  if (area === "task-reminders" && id && method === "PUT") {
    const body = z
      .object({
        revision: z.number().int().positive(),
        timezone: zoneSchema,
        field: z.enum(["planned", "due"]),
        offsets: z.array(z.number().int().min(0).max(10080)).max(3),
      })
      .strict()
      .parse(await json(request));
    if (
      !sqlite()
        .prepare(
          "SELECT 1 FROM tasks WHERE id=? AND owner_id=? AND revision=? AND trashed_at IS NULL",
        )
        .get(id, owner, body.revision)
    )
      throw new HttpError(
        409,
        "This task changed. Reload it before setting reminders.",
      );
    sqlite()
      .prepare(
        "INSERT INTO calendar_task_reminders VALUES(?,?,?,?) ON CONFLICT(task_id,field) DO UPDATE SET timezone=excluded.timezone,field=excluded.field,offsets=excluded.offsets",
      )
      .run(id, body.timezone, body.field, JSON.stringify(body.offsets));
    sqlite()
      .prepare(
        "UPDATE calendar_reminders SET state='cancelled' WHERE source_type='task' AND source_id=? AND state='queued'",
      )
      .run(id);
    invalidateCalendarReminders();
    return response({ ok: true });
  }
  if (area === "reminders") {
    if (method === "GET")
      return response(
        reminderList(
          owner,
          z.coerce
            .number()
            .int()
            .min(0)
            .max(100000)
            .parse(url.searchParams.get("offset") ?? 0),
        ),
      );
    if (method === "PATCH" && id) {
      sqlite()
        .prepare(
          "UPDATE calendar_reminders SET dismissed=1 WHERE id=? AND owner_id=?",
        )
        .run(
          z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(id),
          owner,
        );
      return response({ ok: true });
    }
  }
  if (area === "subscriptions") {
    if (!session)
      throw new HttpError(403, "Enable device notifications in the app.");
    if (method === "GET")
      return response({
        publicKey: pushKeys().publicKey,
        hashes: sqlite()
          .prepare(
            "SELECT endpoint_hash AS hash FROM push_subscriptions WHERE owner_id=? AND session_id=?",
          )
          .all(owner, session),
      });
    if (id === "test" && method === "POST")
      return response(testDeviceReminder(owner, session));
    if (method === "POST") {
      const body = z
        .object({
          endpoint: z.string().url().max(4096),
          expirationTime: z
            .number()
            .finite()
            .nonnegative()
            .nullable()
            .optional(),
          keys: z
            .object({
              p256dh: z.string().min(80).max(100),
              auth: z.string().min(20).max(30),
            })
            .strict(),
        })
        .strict()
        .parse(await json(request));
      return response(await saveSubscription(owner, session, body));
    }
    if (method === "DELETE") {
      const body = z
        .object({ endpoint: z.string().url().max(4096) })
        .strict()
        .parse(await json(request));
      return response(removeSubscription(owner, body.endpoint));
    }
  }
  if (area === "tasks" && method === "GET") {
    const mode = z
        .enum(["unscheduled", "overdue"])
        .parse(url.searchParams.get("mode")),
      date = dateSchema.parse(url.searchParams.get("date")),
      offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(url.searchParams.get("offset") ?? 0);
    const condition =
      "owner_id=? AND trashed_at IS NULL AND completed_at IS NULL AND " +
      (mode === "unscheduled"
        ? "due_date IS NULL AND planned_date IS NULL"
        : "due_date<?");
    const parameters = [owner, ...(mode === "overdue" ? [date] : [])];
    const total = (
      sqlite()
        .prepare(`SELECT count(*) AS total FROM tasks WHERE ${condition}`)
        .get(...parameters) as { total: number }
    ).total;
    const rows = sqlite()
      .prepare(
        "SELECT id,title,revision,due_date AS dueDate,planned_date AS plannedDate FROM tasks WHERE " +
          condition +
          " ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?",
      )
      .all(...parameters, offset);
    return response({
      items: rows.slice(0, 50),
      total,
      nextOffset: rows.length > 50 ? offset + 50 : null,
    });
  }
  throw new HttpError(404, "This calendar endpoint was not found.");
}
