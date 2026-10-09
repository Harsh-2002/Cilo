import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { formDefinitionSchema, formDeadlineSchema } from "../src/lib/forms";
import { zoneDay } from "../src/lib/calendar";

test("form closing dates and daily submissions integrate with Calendar across DST and Trash", async (t) => {
  let now = Date.UTC(2026, 9, 9, 12);
  t.mock.method(Date, "now", () => now);
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-form-calendar-"));
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_PUBLIC_URL = "https://example.test";
  const { sqlite } = await import("../src/lib/server/db");
  const {
    createForm,
    getForm,
    updateForm,
    publishForm,
    publicForm,
    submitForm,
    changeFormStatus,
    listForms,
  } = await import("../src/lib/server/forms");
  const { listFormResponses, updateFormResponse, exportFormJson } =
    await import("../src/lib/server/form-results");
  const { createFormUploadSession } =
    await import("../src/lib/server/form-uploads");
  const { calendarRange } = await import("../src/lib/server/calendar");
  const database = sqlite(),
    owner = randomUUID();
  database
    .prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    )
    .run(owner, "Owner", "owner@example.test", "owner");
  const definition = formDefinitionSchema.parse({
    schemaVersion: 1,
    title: "Survey",
    fields: [
      { id: randomUUID(), type: "email", label: "Email", required: true },
    ],
  });
  const timezone = "America/New_York";
  try {
    assert.equal(
      formDeadlineSchema.safeParse({ date: "2026-02-30", timezone }).success,
      false,
    );
    assert.equal(
      formDeadlineSchema.safeParse({
        date: "2026-11-01",
        timezone: "Invalid/Zone",
      }).success,
      false,
    );
    const draft = createForm(owner, {
      definition,
      deadline: { date: "2026-11-01", timezone },
    });
    assert.equal(draft.closesAt, zoneDay("2026-11-02", timezone));
    assert.equal(
      draft.closesAt! - zoneDay("2026-11-01", timezone),
      25 * 3600000,
    );
    assert.equal(
      calendarRange(owner, "2026-11-01", "2026-11-03", timezone).items.length,
      0,
    );
    let form = publishForm(owner, draft.id, draft.revision);
    const token = form.publicToken!;
    const closing = calendarRange(
      owner,
      "2026-11-01",
      "2026-11-03",
      timezone,
    ).items;
    assert.equal(closing.length, 1);
    assert.equal(closing[0].type, "form");
    assert.equal(closing[0].date, "2026-11-01");
    assert.equal(closing[0].sourceId, form.id);
    assert.equal(
      calendarRange(randomUUID(), "2026-11-01", "2026-11-03", timezone).items
        .length,
      0,
    );
    now = form.closesAt! - 1;
    assert.equal(publicForm(token).status, "published");
    now = form.closesAt!;
    assert.equal(publicForm(token).status, "closed");
    assert.throws(
      () => createFormUploadSession(token, form.publishedVersionId!),
      /closed/,
    );
    now = Date.UTC(2026, 9, 9, 12);
    form = updateForm(owner, form.id, {
      revision: form.revision,
      deadline: { date: "2026-11-03", timezone },
    });
    const times = [
      zoneDay("2026-11-01", timezone) - 1,
      zoneDay("2026-11-01", timezone),
      zoneDay("2026-11-02", timezone) - 1,
      zoneDay("2026-11-02", timezone),
    ];
    const submissions = times.map((at) => {
      now = at;
      return submitForm(token, {
        versionId: form.publishedVersionId!,
        retryKey: randomUUID(),
        answers: { [definition.fields[0].id]: "someone@example.test" },
      });
    });
    now = Date.UTC(2026, 9, 9, 12);
    const filter = new URLSearchParams({
      date: "2026-11-01",
      timezone,
      limit: "1",
    });
    const first = listFormResponses(owner, form.id, filter);
    assert.equal(first.total, 2);
    assert.ok(first.next);
    const second = listFormResponses(
      owner,
      form.id,
      new URLSearchParams({
        ...Object.fromEntries(filter),
        after: first.next!,
      }),
    );
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.throws(
      () =>
        listFormResponses(
          owner,
          form.id,
          new URLSearchParams({
            date: "2026-11-02",
            timezone,
            after: first.next!,
          }),
        ),
      /different query/,
    );
    assert.equal(
      JSON.parse([...exportFormJson(owner, form.id, filter)].join("")).length,
      2,
    );
    const activity = calendarRange(
      owner,
      "2026-11-01",
      "2026-11-03",
      timezone,
      { mode: "activity" },
    ).items.filter((item) => item.id.startsWith("form-responses:"));
    assert.deepEqual(activity.map((item) => [item.date, item.label]).sort(), [
      ["2026-11-01", "2 submissions"],
      ["2026-11-02", "1 submission"],
    ]);
    updateFormResponse(owner, form.id, submissions[1].id, {
      revision: 1,
      trashed: true,
    });
    assert.equal(
      calendarRange(owner, "2026-11-01", "2026-11-02", timezone, {
        mode: "activity",
      }).items.find((item) => item.id.startsWith("form-responses:"))?.label,
      "1 submission",
    );
    const updated = updateForm(owner, form.id, {
      revision: form.revision,
      deadline: { date: "2026-10-01", timezone },
    });
    assert.equal(publicForm(token).status, "closed");
    assert.throws(
      () => createFormUploadSession(token, form.publishedVersionId!),
      /closed/,
    );
    assert.throws(
      () =>
        submitForm(token, {
          versionId: form.publishedVersionId!,
          retryKey: randomUUID(),
          answers: { [definition.fields[0].id]: "new@example.test" },
        }),
      /closed/,
    );
    assert.equal(
      listForms(owner, new URLSearchParams({ status: "published" })).total,
      0,
    );
    assert.equal(
      listForms(owner, new URLSearchParams({ status: "closed" })).items[0]
        .status,
      "closed",
    );
    assert.equal(
      calendarRange(owner, "2026-11-01", "2026-11-03", timezone).items.length,
      0,
    );
    const closed = changeFormStatus(owner, form.id, updated.revision, "close");
    assert.ok("revision" in closed);
    assert.throws(
      () => changeFormStatus(owner, form.id, closed.revision, "reopen"),
      /closing date/,
    );
    const undated = updateForm(owner, form.id, {
      revision: closed.revision,
      deadline: null,
    });
    const reopened = changeFormStatus(
      owner,
      form.id,
      undated.revision,
      "reopen",
    );
    assert.ok("revision" in reopened);
    assert.equal(publicForm(token).status, "published");
    assert.equal(getForm(owner, form.id).deadline, null);
    changeFormStatus(owner, form.id, reopened.revision, "trash");
    assert.equal(
      calendarRange(owner, "2026-11-01", "2026-11-03", timezone, {
        mode: "activity",
      }).items.filter((item) => item.type === "form").length,
      0,
    );
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
