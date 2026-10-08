import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  eventInput,
  eventOccurrences,
  type CalendarEvent,
} from "../src/lib/calendar";
const input = {
  title: "Review",
  start: "2026-10-08",
  end: "2026-10-09",
  timezone: "America/New_York",
};
function event(value: unknown): CalendarEvent {
  return {
    ...eventInput.parse(value),
    id: randomUUID(),
    ownerId: "owner",
    revision: 1,
    trashedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}
test("calendar date validation rejects impossible dates and ambiguous local times", () => {
  assert.equal(
    eventInput.safeParse({ ...input, start: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    eventInput.safeParse({
      ...input,
      allDay: false,
      start: "2026-03-08T02:30",
      end: "2026-03-08T03:30",
    }).success,
    false,
  );
  assert.equal(
    eventInput.safeParse({
      ...input,
      allDay: false,
      start: "2026-11-01T01:30",
      end: "2026-11-01T02:30",
    }).success,
    false,
  );
  assert.equal(
    eventInput.safeParse({
      ...input,
      allDay: false,
      start: "2026-11-01T01:30",
      end: "2026-11-01T02:30",
      disambiguation: "later",
    }).success,
    true,
  );
});
test("monthly ordinal recurrence and multi-day overlap preserve occurrence identities", () => {
  const value = event({
    ...input,
    start: "2026-01-01",
    end: "2026-01-03",
    recurrence: {
      frequency: "monthly",
      weekdays: [1, 2, 3, 4, 5],
      ordinal: -1,
    },
  });
  const rows = eventOccurrences(
    value,
    "2026-10-01",
    "2026-11-02",
    "Europe/London",
  );
  assert.deepEqual(
    rows.map((row) => row.date),
    ["2026-09-30", "2026-10-30"],
  );
  assert.equal(rows[1].endDate, "2026-11-01");
  assert.equal(rows[1].occurrence, "2026-10-30");
});
test("recurrence skips nonexistent daylight-saving times without consuming the occurrence count", () => {
  const value = event({
    ...input,
    allDay: false,
    start: "2026-03-07T02:30",
    end: "2026-03-07T03:30",
    recurrence: { frequency: "daily", count: 3 },
  });
  const rows = eventOccurrences(
    value,
    "2026-03-07",
    "2026-03-12",
    "America/New_York",
  );
  assert.deepEqual(
    rows.map((row) => row.date),
    ["2026-03-07", "2026-03-09", "2026-03-10"],
  );
});
test("calendar persistence enforces ownership and revisions and restores deleted overrides safely", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-calendar-"));
  process.env.NIVRA_DATA_DIR = directory;
  const { sqlite } = await import("../src/lib/server/db");
  const d = sqlite();
  const { createEvent, updateEvent, trashEvent, calendarRange, getEvent } =
    await import("../src/lib/server/calendar");
  const owner = randomUUID();
  d.prepare(
    "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  ).run(owner, "Calendar test", "calendar@local.invalid", "calendar", 1, 1);
  try {
    const first = createEvent(owner, {
      ...input,
      allDay: false,
      start: "2026-10-08T10:00",
      end: "2026-10-08T11:00",
    });
    assert.equal(
      calendarRange(owner, "2026-10-08", "2026-10-09", "America/New_York")
        .counts["2026-10-08"],
      1,
    );
    assert.throws(() => getEvent("other", first.id), /not found/);
    assert.throws(
      () => updateEvent(owner, first.id, first.revision + 1, input),
      /changed/,
    );
    const series = createEvent(owner, {
      ...input,
      recurrence: { frequency: "daily", count: 3 },
    });
    const override = updateEvent(
      owner,
      series.id,
      1,
      { ...input, title: "Moved", start: "2026-10-09", end: "2026-10-10" },
      "occurrence",
      "2026-10-08",
    );
    assert.equal(
      calendarRange(
        owner,
        "2026-10-08",
        "2026-10-12",
        "America/New_York",
      ).items.filter((row) => row.sourceId === series.id).length,
      2,
    );
    trashEvent(owner, override.id, override.revision);
    d.prepare("DELETE FROM calendar_events WHERE id=?").run(override.id);
    assert.equal(
      calendarRange(
        owner,
        "2026-10-08",
        "2026-10-12",
        "America/New_York",
      ).items.filter((row) => row.sourceId === series.id).length,
      2,
    );
    const current = createEvent(owner, {
      ...input,
      recurrence: { frequency: "daily", count: 5 },
    });
    const following = updateEvent(
      owner,
      current.id,
      1,
      {
        ...input,
        title: "Following",
        start: "2026-10-10",
        end: "2026-10-11",
        recurrence: { frequency: "daily", count: 5 },
      },
      "following",
      "2026-10-10",
    );
    assert.equal(following.recurrence?.count, 3);
    const rows = calendarRange(owner, "2026-10-01", "2026-11-01", "UTC").items;
    assert.equal(rows.filter((item) => item.sourceId === current.id).length, 2);
    assert.equal(
      rows.filter((item) => item.sourceId === following.id).length,
      3,
    );
    assert.throws(() => updateEvent(owner, current.id, 1, input), /changed/);
    const restoreSeries = createEvent(owner, {
      ...input,
      title: "Restore series",
      recurrence: { frequency: "daily", count: 3 },
    });
    const detached = updateEvent(
      owner,
      restoreSeries.id,
      1,
      { ...input, title: "Detached" },
      "occurrence",
      "2026-10-08",
    );
    const parent = getEvent(owner, restoreSeries.id);
    trashEvent(owner, parent.id, parent.revision);
    assert.ok(getEvent(owner, detached.id).trashedAt);
    const { restoreTrash } = await import("../src/lib/server/trash");
    const trashedParent = getEvent(owner, parent.id);
    restoreTrash(owner, "event", parent.id, trashedParent.revision);
    assert.equal(getEvent(owner, detached.id).trashedAt, null);
    const { createTask, updateTask } = await import("../src/lib/server/tasks");
    const recurringTask = createTask(owner, "Weekly review", {
      plannedDate: "2026-10-06",
      dueDate: "2026-10-08",
      recurrence: "weekly",
    });
    d.prepare("INSERT INTO calendar_task_reminders VALUES(?,?,?,?)").run(
      recurringTask.id,
      "America/New_York",
      "due",
      "[0,15]",
    );
    updateTask(owner, recurringTask.id, {
      revision: recurringTask.revision,
      plannedDate: "2026-10-07",
      completed: true,
    });
    const successor = d
      .prepare(
        "SELECT id,planned_date AS plannedDate,due_date AS dueDate FROM tasks WHERE parent_task_id=?",
      )
      .get(recurringTask.id) as {
      id: string;
      plannedDate: string;
      dueDate: string;
    };
    assert.equal(successor.plannedDate, "2026-10-14");
    assert.equal(successor.dueDate, "2026-10-15");
    assert.deepEqual(
      d
        .prepare(
          "SELECT timezone,field,offsets FROM calendar_task_reminders WHERE task_id=?",
        )
        .get(successor.id),
      { timezone: "America/New_York", field: "due", offsets: "[0,15]" },
    );
    const { exportCalendarBundle, importCalendarBundle, portableCalendar } =
      await import("../src/lib/server/calendar-bundle");
    const exported = await exportCalendarBundle(owner);
    const bundle = portableCalendar.parse(exported.data);
    const remappedTasks = new Map<string, string>();
    for (const source of [recurringTask.id, successor.id]) {
      const restoredId = randomUUID();
      d.prepare(
        "INSERT INTO tasks(id,owner_id,title,created_at,updated_at,planned_date,due_date) SELECT ?,owner_id,title,created_at,updated_at,planned_date,due_date FROM tasks WHERE id=?",
      ).run(restoredId, source);
      remappedTasks.set(source, restoredId);
    }
    d.transaction(() =>
      importCalendarBundle(
        owner,
        bundle,
        {
          notes: new Map(),
          tasks: remappedTasks,
          bookmarks: new Map(),
        },
        new Map(),
      ),
    ).immediate();
    const restored = d
      .prepare(
        "SELECT id FROM calendar_events WHERE owner_id=? AND title='Following' AND id<>?",
      )
      .get(owner, following.id) as { id: string };
    assert.ok(restored);
    assert.equal(getEvent(owner, restored.id).recurrence?.count, 3);
    const exceptionCount = (
      d.prepare("SELECT count(*) AS n FROM calendar_exceptions").get() as {
        n: number;
      }
    ).n;
    assert.equal(exceptionCount, bundle.exceptions.length * 2);
    const insertActivity = d.prepare(
      "INSERT INTO tasks(id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
    );
    d.transaction(() => {
      for (const timestamp of [
        "2026-11-01T03:59:00Z",
        "2026-11-01T04:00:00Z",
        "2026-11-02T04:59:00Z",
        "2026-11-02T05:00:00Z",
      ]) {
        const at = Date.parse(timestamp);
        insertActivity.run(randomUUID(), owner, "Timezone boundary", at, at);
      }
      for (let index = 0; index < 1000; index++) {
        const at = Date.parse("2026-11-01T04:00:00Z") + index;
        insertActivity.run(
          randomUUID(),
          owner,
          "Activity scale " + index,
          at,
          at,
        );
      }
    }).immediate();
    const activity = calendarRange(
      owner,
      "2026-10-31",
      "2026-11-03",
      "America/New_York",
      { mode: "activity", preview: 3 },
    );
    assert.equal(activity.total, 1004);
    assert.equal(activity.items.length, 5);
    assert.deepEqual(activity.counts, {
      "2026-10-31": 1,
      "2026-11-01": 1002,
      "2026-11-02": 1,
    });
    assert.equal(d.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    const { stopJobWorker } = await import("../src/lib/server/jobs");
    await stopJobWorker();
    d.close();
    await rm(directory, { recursive: true, force: true });
  }
});
