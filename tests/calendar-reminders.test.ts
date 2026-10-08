import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("durable reminders deduplicate, cancel completed tasks, reject private providers and skip expired deliveries", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "nivra-calendar-reminders-"),
  );
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db"),
    d = sqlite();
  const { createEvent, updateEvent } =
    await import("../src/lib/server/calendar");
  const {
    prepareReminders,
    dispatchReminders,
    validatedPushEndpoint,
    pushKeys,
    reminderList,
  } = await import("../src/lib/server/calendar-reminders");
  const owner = randomUUID();
  d.prepare(
    "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  ).run(owner, "Reminder test", "reminder@local.invalid", "reminder", 1, 1);
  try {
    const now = Date.parse("2026-10-08T09:00:00Z");
    const event = createEvent(owner, {
      title: "Reminder",
      allDay: false,
      start: "2026-10-08T09:00",
      end: "2026-10-08T10:00",
      timezone: "UTC",
      reminders: [0, 15],
    });
    prepareReminders(now);
    prepareReminders(now);
    d.prepare("UPDATE calendar_reminders SET state='cancelled'").run();
    prepareReminders(now - 3600000);
    assert.equal(
      (
        d
          .prepare(
            "SELECT count(*) AS n FROM calendar_reminders WHERE state='queued'",
          )
          .get() as { n: number }
      ).n,
      2,
    );
    d.prepare(
      "UPDATE calendar_reminders SET state='cancelled' WHERE scheduled_at<?",
    ).run(now);
    prepareReminders(now);
    assert.equal(
      (
        d
          .prepare(
            "SELECT count(*) AS n FROM calendar_reminders WHERE state='cancelled'",
          )
          .get() as { n: number }
      ).n,
      1,
    );
    d.prepare("UPDATE calendar_reminders SET state='queued'").run();
    assert.equal(
      (
        d.prepare("SELECT count(*) AS n FROM calendar_reminders").get() as {
          n: number;
        }
      ).n,
      2,
    );
    const task = randomUUID();
    d.prepare(
      "INSERT INTO tasks(id,owner_id,title,created_at,updated_at,due_date) VALUES(?,?,?,?,?,?)",
    ).run(task, owner, "Due", 1, 1, "2026-10-08");
    d.prepare("INSERT INTO calendar_task_reminders VALUES(?,?,?,?)").run(
      task,
      "UTC",
      "due",
      "[0]",
    );
    prepareReminders(now);
    d.prepare("UPDATE tasks SET completed_at=? WHERE id=?").run(now, task);
    let sent = 0;
    await dispatchReminders("https://example.com", now, async () => {
      sent++;
      return { statusCode: 201, headers: {}, body: "" };
    });
    assert.equal(sent, 0);
    assert.equal(
      (
        d
          .prepare(
            "SELECT state FROM calendar_reminders WHERE source_type='task'",
          )
          .get() as { state: string }
      ).state,
      "cancelled",
    );
    assert.equal(
      (
        d
          .prepare(
            "SELECT count(*) AS n FROM calendar_reminders WHERE state='listed'",
          )
          .get() as { n: number }
      ).n,
      2,
    );
    const changed = updateEvent(owner, event.id, event.revision, {
      title: "Changed",
      allDay: false,
      start: "2026-10-08T09:00",
      end: "2026-10-08T10:00",
      timezone: "UTC",
      reminders: [0],
    });
    prepareReminders(now);
    await dispatchReminders("https://example.com", now + 7200000);
    assert.equal(
      (
        d
          .prepare(
            "SELECT state FROM calendar_reminders WHERE revision=? AND source_type='event'",
          )
          .get(changed.revision) as { state: string }
      ).state,
      "listed",
    );
    assert.deepEqual(pushKeys(), pushKeys());
    await assert.rejects(validatedPushEndpoint("http://example.com/push"));
    await assert.rejects(validatedPushEndpoint("https://127.0.0.1/push"));
    const { calendarApi } = await import("../src/lib/server/calendar-api");
    const subscription = {
      endpoint: "https://127.0.0.1/push",
      keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
    };
    const register = (body: unknown) =>
      calendarApi(
        new Request("https://example.com/api/nivra/calendar/subscriptions", {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
        owner,
        "fixture-session",
        ["calendar", "subscriptions"],
      );
    for (const expirationTime of [undefined, null, now + 86400000]) {
      await assert.rejects(register({ ...subscription, expirationTime }), {
        message: "The push endpoint is not public.",
      });
    }
    for (const invalid of [
      { ...subscription, expirationTime: "tomorrow" },
      { ...subscription, expirationTime: -1 },
      { ...subscription, expirationTime: null, unexpected: true },
    ]) {
      await assert.rejects(register(invalid), { name: "ZodError" });
    }
    assert.equal(reminderList("other").items.length, 0);
    const { seal, masterKey } = await import("../src/lib/server/encryption");
    const { createHash } = await import("node:crypto");
    const session = randomUUID();
    d.prepare(
      "INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES(?,?,?,?,?,?)",
    ).run(session, Date.now() + 86400000, randomUUID(), now, now, owner);
    const endpoint = "https://push.example.test/send/fixture",
      hash = createHash("sha256").update(endpoint).digest("hex"),
      subscriptionId = randomUUID();
    d.prepare(
      "INSERT INTO push_subscriptions(id,owner_id,session_id,endpoint_hash,data,created_at) VALUES(?,?,?,?,?,?)",
    ).run(
      subscriptionId,
      owner,
      session,
      hash,
      seal(
        Buffer.from(
          JSON.stringify({
            endpoint,
            keys: { auth: "fixture", p256dh: "fixture" },
          }),
        ),
        masterKey(directory),
        "push:" + hash,
      ),
      now - 1,
    );
    const pushEvent = createEvent(owner, {
      title: "Private reminder",
      allDay: false,
      start: "2026-10-08T09:00",
      end: "2026-10-08T10:00",
      timezone: "UTC",
      reminders: [0],
    });
    prepareReminders(now);
    const resolve = async () => ({ address: "93.184.216.34", family: 4 });
    let attempts = 0;
    await dispatchReminders(
      "https://example.com",
      now,
      async (_subscription, payload) => {
        attempts++;
        assert.equal(JSON.parse(String(payload)).title, "Private reminder");
        throw Object.assign(new Error("Temporary failure"), {
          statusCode: 503,
        });
      },
      resolve,
    );
    assert.equal(attempts, 1);
    const retryEdited = updateEvent(owner, pushEvent.id, pushEvent.revision, {
      title: "Private reminder updated",
      allDay: false,
      start: "2026-10-08T09:00",
      end: "2026-10-08T10:00",
      timezone: "UTC",
      reminders: [0],
    });
    prepareReminders(now + 30000);
    await dispatchReminders(
      "https://example.com",
      now + 30000,
      async () => {
        attempts++;
        return { statusCode: 201, headers: {}, body: "" };
      },
      resolve,
    );
    assert.equal(attempts, 1);
    await dispatchReminders(
      "https://example.com",
      now + 60000,
      async () => {
        attempts++;
        return { statusCode: 201, headers: {}, body: "" };
      },
      resolve,
    );
    assert.equal(attempts, 2);
    await dispatchReminders(
      "https://example.com",
      now + 120000,
      async () => {
        attempts++;
        return { statusCode: 201, headers: {}, body: "" };
      },
      resolve,
    );
    assert.equal(attempts, 2);
    assert.equal(
      (
        d
          .prepare("SELECT state FROM calendar_reminders WHERE source_id=?")
          .get(pushEvent.id) as { state: string }
      ).state,
      "accepted",
    );
    let edited = retryEdited;
    for (let i = 0; i < 3; i++) {
      edited = updateEvent(owner, edited.id, edited.revision, {
        title: `Edited reminder ${i}`,
        allDay: false,
        start: "2026-10-08T09:00",
        end: "2026-10-08T10:00",
        timezone: "UTC",
        reminders: [0],
      });
      prepareReminders(now + 120000);
      await dispatchReminders(
        "https://example.com",
        now + 120000,
        async () => {
          attempts++;
          return { statusCode: 201, headers: {}, body: "" };
        },
        resolve,
      );
    }
    assert.equal(
      attempts,
      2,
      "Editing a delivered event must not send it again",
    );
    assert.equal(
      (
        d
          .prepare(
            "SELECT count(*) AS n FROM calendar_reminders WHERE source_id=?",
          )
          .get(pushEvent.id) as { n: number }
      ).n,
      1,
    );
    edited = updateEvent(owner, edited.id, edited.revision, {
      title: "Legacy queue",
      allDay: false,
      start: "2026-10-08T09:00",
      end: "2026-10-08T10:00",
      timezone: "UTC",
      reminders: [0],
    });
    d.prepare(
      "INSERT INTO calendar_reminders(id,owner_id,source_type,source_id,occurrence,revision,title,starts_at,scheduled_at,expires_at) SELECT ?,owner_id,source_type,source_id,occurrence,?,title,starts_at,scheduled_at,expires_at FROM calendar_reminders WHERE source_id=? LIMIT 1",
    ).run(randomUUID(), edited.revision, edited.id);
    prepareReminders(now + 180000);
    await dispatchReminders(
      "https://example.com",
      now + 180000,
      async () => {
        attempts++;
        return { statusCode: 201, headers: {}, body: "" };
      },
      resolve,
    );
    assert.equal(
      attempts,
      2,
      "Legacy revision queues must reuse accepted device deliveries",
    );
    const secondEndpoint = "https://push.example.test/send/second";
    const secondHash = createHash("sha256")
      .update(secondEndpoint)
      .digest("hex");
    d.prepare(
      "INSERT INTO push_subscriptions(id,owner_id,session_id,endpoint_hash,data,created_at) VALUES(?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      owner,
      session,
      secondHash,
      seal(
        Buffer.from(
          JSON.stringify({
            endpoint: secondEndpoint,
            keys: { auth: "fixture", p256dh: "fixture" },
          }),
        ),
        masterKey(directory),
        "push:" + secondHash,
      ),
      now - 1,
    );
    const multi = createEvent(owner, {
      title: "Two devices",
      allDay: false,
      start: "2026-10-08T10:00",
      end: "2026-10-08T11:00",
      timezone: "UTC",
      reminders: [0],
    });
    prepareReminders(now + 3600000);
    const perDevice = new Map<string, number>();
    const send = async (
      subscription: { endpoint: string },
      payload: unknown,
    ) => {
      const count = (perDevice.get(subscription.endpoint) ?? 0) + 1;
      perDevice.set(subscription.endpoint, count);
      if (subscription.endpoint === secondEndpoint && count === 1)
        throw Object.assign(new Error("Retry second device"), {
          statusCode: 503,
        });
      if (count === 2)
        assert.equal(JSON.parse(String(payload)).title, "Two devices edited");
      return { statusCode: 201, headers: {}, body: "" };
    };
    await dispatchReminders(
      "https://example.com",
      now + 3600000,
      send,
      resolve,
    );
    updateEvent(owner, multi.id, multi.revision, {
      title: "Two devices edited",
      allDay: false,
      start: "2026-10-08T10:00",
      end: "2026-10-08T11:00",
      timezone: "UTC",
      reminders: [0],
    });
    prepareReminders(now + 3630000);
    await dispatchReminders(
      "https://example.com",
      now + 3660000,
      send,
      resolve,
    );
    assert.equal(
      perDevice.get(endpoint),
      1,
      "The accepted device must not receive a retry",
    );
    assert.equal(
      perDevice.get(secondEndpoint),
      2,
      "The failed device must retain its retry after an edit",
    );
    d.prepare("DELETE FROM session WHERE id=?").run(session);
    assert.equal(
      d
        .prepare("SELECT 1 FROM push_subscriptions WHERE id=?")
        .get(subscriptionId),
      undefined,
    );
  } finally {
    d.close();
    await rm(directory, { recursive: true, force: true });
  }
});
