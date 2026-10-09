import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { formDefinitionSchema } from "../src/lib/forms";

test("form publication preserves versions, revisions, ownership and revoked links", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-forms-"));
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_PUBLIC_URL = "https://example.test";
  const { sqlite } = await import("../src/lib/server/db");
  const {
    createForm,
    getForm,
    updateForm,
    publishForm,
    changeFormStatus,
    publicForm,
    submitForm,
  } = await import("../src/lib/server/forms");
  const database = sqlite();
  const owner = randomUUID();
  database
    .prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    )
    .run(owner, "Owner", "owner@example.test", "owner");
  try {
    const questionId = randomUUID();
    const definition = formDefinitionSchema.parse({
      schemaVersion: 1,
      title: "Feedback",
      fields: [{ id: questionId, type: "short_text", label: "Your idea" }],
      confirmation: `Received: {{field:${questionId}}}`,
    });
    const draft = createForm(owner, { definition });
    assert.throws(() => getForm(randomUUID(), draft.id), /not found/);
    assert.throws(() => publishForm(owner, draft.id, 9), /changed/);
    const published = publishForm(owner, draft.id, draft.revision);
    assert.equal(
      published.url,
      `https://example.test/form/${published.publicToken}`,
    );
    assert.equal(
      publicForm(published.publicToken!).definition.title,
      "Feedback",
    );
    const submission = {
      versionId: published.publishedVersionId!,
      retryKey: randomUUID(),
      answers: { [definition.fields[0].id]: "An idea" },
    };
    const accepted = submitForm(published.publicToken!, submission);
    assert.equal(accepted.confirmation, "Received: An idea");
    assert.deepEqual(submitForm(published.publicToken!, submission), accepted);
    assert.equal(getForm(owner, draft.id).total, 1);
    assert.throws(
      () =>
        submitForm(published.publicToken!, {
          ...submission,
          answers: { [definition.fields[0].id]: "Different" },
        }),
      /different answers/,
    );
    const edit = updateForm(owner, draft.id, {
      revision: published.revision,
      definition: {
        ...definition,
        title: "New title",
        confirmation: `New message: {{field:${questionId}}}`,
      },
    });
    assert.equal(
      publicForm(published.publicToken!).definition.title,
      "Feedback",
    );
    assert.throws(
      () =>
        updateForm(owner, draft.id, {
          revision: published.revision,
          favorite: true,
        }),
      /changed/,
    );
    assert.throws(
      () =>
        updateForm(owner, draft.id, {
          revision: edit.revision,
          definition: {
            ...definition,
            fields: [{ ...definition.fields[0], type: "email" }],
          },
        }),
      /new question identifier/,
    );
    const changed = publishForm(owner, draft.id, edit.revision);
    assert.deepEqual(
      submitForm(published.publicToken!, submission),
      accepted,
      "Retries retain the original version's confirmation",
    );
    assert.equal(
      submitForm(changed.publicToken!, {
        ...submission,
        versionId: changed.publishedVersionId!,
        retryKey: randomUUID(),
      }).confirmation,
      "New message: An idea",
    );
    assert.equal(changed.publicToken, published.publicToken);
    assert.notEqual(changed.publishedVersionId, published.publishedVersionId);
    assert.equal(
      publicForm(changed.publicToken!).definition.title,
      "New title",
    );
    const oldVersion = database
      .prepare("SELECT definition FROM form_versions WHERE id=?")
      .get(published.publishedVersionId) as { definition: string };
    assert.equal(JSON.parse(oldVersion.definition).title, "Feedback");
    const closed = changeFormStatus(owner, draft.id, changed.revision, "close");
    assert.ok("revision" in closed);
    assert.equal(publicForm(published.publicToken!).status, "closed");
    assert.deepEqual(submitForm(published.publicToken!, submission), accepted);
    assert.throws(
      () =>
        submitForm(published.publicToken!, {
          ...submission,
          versionId: changed.publishedVersionId!,
          retryKey: randomUUID(),
        }),
      /closed/,
    );

    const closedEdit = updateForm(owner, draft.id, {
      revision: closed.revision,
      definition: {
        ...changed.definition,
        description: "Published while closed",
      },
    });
    const closedPublication = publishForm(owner, draft.id, closedEdit.revision);
    assert.equal(closedPublication.status, "closed");
    assert.equal(publicForm(published.publicToken!).status, "closed");
    const reopened = changeFormStatus(
      owner,
      draft.id,
      closedPublication.revision,
      "reopen",
    );
    assert.ok("revision" in reopened);
    const unpublished = changeFormStatus(
      owner,
      draft.id,
      reopened.revision,
      "unpublish",
    );
    assert.ok("revision" in unpublished);
    assert.throws(() => publicForm(published.publicToken!), /not available/);
    const republished = publishForm(owner, draft.id, unpublished.revision);
    assert.notEqual(republished.publicToken, published.publicToken);
    changeFormStatus(owner, draft.id, republished.revision, "trash");
    assert.throws(() => publicForm(republished.publicToken!), /not available/);
    assert.throws(() => getForm(owner, draft.id), /not found/);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
