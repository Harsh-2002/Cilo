import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { formDefinitionSchema } from "../src/lib/forms";

test("form results preserve versioned answers, filtered exports and bounded private files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nivra-form-results-"));
  process.env.NIVRA_DATA_DIR = directory;
  process.env.NIVRA_PUBLIC_URL = "https://example.test";
  const { sqlite } = await import("../src/lib/server/db");
  const { createForm, publishForm, submitForm, getForm, updateForm } =
    await import("../src/lib/server/forms");
  const {
    listFormResponses,
    getFormResponse,
    updateFormResponse,
    formSummary,
    exportFormResponses,
    csvCell,
    exportFormCsv,
    exportFormJson,
  } = await import("../src/lib/server/form-results");
  const {
    createFormUploadSession,
    reserveFormUpload,
    writeFormUpload,
    cleanupFormUploads,
    formFile,
    detectedFormFile,
  } = await import("../src/lib/server/form-uploads");
  const { storage } = await import("../src/lib/server/storage");
  const { jobsIdle, stopJobWorker } = await import("../src/lib/server/jobs");
  const { referencedFiles } = await import("../src/lib/server/backups");

  const database = sqlite(),
    owner = randomUUID();
  database
    .prepare(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    )
    .run(owner, "Owner", "owner@example.test", "owner");
  try {
    const amount = randomUUID(),
      text = randomUUID(),
      file = randomUUID();
    const definition = formDefinitionSchema.parse({
      schemaVersion: 1,
      title: "Survey",
      fields: [
        { id: amount, label: "Amount", type: "amount", required: true },
        { id: text, label: "Message", type: "short_text" },
        { id: file, label: "File", type: "file", maxFiles: 1 },
      ],
    });
    const draft = createForm(owner, { definition }),
      form = publishForm(owner, draft.id, draft.revision);
    const token = form.publicToken!,
      versionId = form.publishedVersionId!;
    for (let i = 0; i < 105; i++)
      submitForm(token, {
        versionId,
        retryKey: randomUUID(),
        answers: {
          [amount]: i === 0 ? "-0.10" : "0.10",
          [text]: `Seaside ${i}`,
        },
      });
    const page = listFormResponses(
      owner,
      form.id,
      new URLSearchParams({ limit: "50" }),
    );
    assert.equal(page.items.length, 50);
    assert.equal(page.total, 105);
    assert.ok(page.next);
    const next = listFormResponses(
      owner,
      form.id,
      new URLSearchParams({ limit: "50", after: page.next! }),
    );
    assert.equal(next.items.length, 50);
    assert.equal(
      new Set([...page.items, ...next.items].map((row) => row.id)).size,
      100,
    );
    assert.equal(
      [
        ...exportFormResponses(
          owner,
          form.id,
          new URLSearchParams({ limit: "1" }),
        ),
      ].length,
      105,
    );
    assert.equal(
      formSummary(owner, form.id).versions[0].fields[0].sum,
      "10.30",
    );
    const result = getFormResponse(owner, form.id, page.items[0].id);
    updateFormResponse(owner, form.id, result.id, {
      revision: result.revision,
      reviewed: true,
    });
    assert.equal(
      listFormResponses(
        owner,
        form.id,
        new URLSearchParams({ reviewed: "reviewed" }),
      ).total,
      1,
    );
    assert.throws(
      () =>
        updateFormResponse(owner, form.id, result.id, {
          revision: result.revision,
          reviewed: false,
        }),
      /changed/,
    );
    assert.equal(
      listFormResponses(owner, form.id, new URLSearchParams({ q: "Seaside" }))
        .total,
      105,
    );
    assert.equal(
      JSON.parse([...exportFormJson(owner, form.id)].join("")).length,
      105,
    );
    const csv = [...exportFormCsv(owner, form.id)].join("");
    assert.match(csv, /Question ID/);
    assert.match(csv, /Seaside/);
    assert.match(csvCell("  =SUM(A1)"), /^"'/);
    assert.equal(csvCell('A "quote"'), '"A ""quote"""');
    assert.throws(
      () =>
        detectedFormFile(
          new TextEncoder().encode("<script>bad</script>"),
          "bad.html",
        ),
      /not supported/,
    );
    assert.throws(
      () =>
        detectedFormFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "fake.docx"),
      /not supported/,
    );
    const tinyBudget = updateForm(owner, form.id, {
      revision: getForm(owner, form.id).revision,
      uploadBudget: 1,
    });
    const limited = createFormUploadSession(token, versionId);
    assert.throws(
      () =>
        reserveFormUpload(token, limited.secret, {
          fieldId: file,
          filename: "large.txt",
          size: 2,
        }),
      /storage limit/,
    );
    updateForm(owner, form.id, {
      revision: tinyBudget.revision,
      uploadBudget: 250 * 1024 * 1024,
    });
    const session = createFormUploadSession(token, versionId);
    const bytes = new TextEncoder().encode("hello world");
    const reservation = reserveFormUpload(token, session.secret, {
      fieldId: file,
      filename: "hello.txt",
      size: bytes.length,
    });
    assert.throws(
      () =>
        reserveFormUpload(token, session.secret, {
          fieldId: file,
          filename: "second.txt",
          size: 1,
        }),
      /allows 1/,
    );
    const ready = await writeFormUpload(
      token,
      session.secret,
      reservation.id,
      bytes,
    );
    assert.equal(ready.mime, "text/plain");
    const response = submitForm(token, {
      versionId,
      retryKey: randomUUID(),
      uploadSecret: session.secret,
      answers: { [amount]: "1.00", [file]: [ready.id] },
    });
    const detail = getFormResponse(owner, form.id, response.id);
    assert.equal(detail.files.length, 1);
    assert.match(
      detail.files[0].url,
      /^https:\/\/example.test\/api\/v1\/forms\//,
    );
    assert.throws(() => formFile(randomUUID(), form.id, ready.id), /not found/);
    const stored = formFile(owner, form.id, ready.id);
    assert.equal((await storage.read(stored.key)).toString(), "hello world");
    const badSession = createFormUploadSession(token, versionId);
    assert.throws(
      () =>
        submitForm(token, {
          versionId,
          retryKey: randomUUID(),
          uploadSecret: badSession.secret,
          answers: { [amount]: "1.00", [file]: [ready.id] },
        }),
      /not available/,
    );
    const abandoned = reserveFormUpload(token, badSession.secret, {
      fieldId: file,
      filename: "abandoned.txt",
      size: bytes.length,
    });
    await writeFormUpload(token, badSession.secret, abandoned.id, bytes);
    assert.equal(await cleanupFormUploads(Date.now() + 25 * 60 * 60 * 1000), 1);
    assert.equal((await storage.read(stored.key)).toString(), "hello world");
    const updated = updateForm(owner, form.id, {
      revision: getForm(owner, form.id).revision,
      definition: { ...definition, title: "Changed" },
    });
    const newVersion = publishForm(owner, form.id, updated.revision);
    submitForm(token, {
      versionId: newVersion.publishedVersionId,
      retryKey: randomUUID(),
      answers: { [amount]: "2.00" },
    });
    assert.equal(formSummary(owner, form.id).versions.length, 2);
    const imageBytes = await readFile("tests/fixtures/ocr-sample.png");
    const imageSession = createFormUploadSession(
      token,
      newVersion.publishedVersionId!,
    );
    const imageReservation = reserveFormUpload(token, imageSession.secret, {
      fieldId: file,
      filename: "image.png",
      size: imageBytes.length,
    });
    await writeFormUpload(
      token,
      imageSession.secret,
      imageReservation.id,
      imageBytes,
    );
    submitForm(token, {
      versionId: newVersion.publishedVersionId,
      retryKey: randomUUID(),
      uploadSecret: imageSession.secret,
      answers: { [amount]: "1.00", [file]: [imageReservation.id] },
    });
    await jobsIdle();
    const thumbnail = formFile(owner, form.id, imageReservation.id);
    assert.ok(thumbnail.thumbnail);
    const inventory = referencedFiles(database);
    assert.ok(inventory.includes(thumbnail.key));
    assert.ok(inventory.includes(thumbnail.thumbnail!));
    assert.equal(
      (
        database.prepare("SELECT count(*) AS total FROM artifacts").get() as {
          total: number;
        }
      ).total,
      0,
    );

    assert.equal(
      getFormResponse(owner, form.id, response.id).definition.title,
      "Survey",
    );
    const batchDraft = createForm(owner, { definition });
    const batch = publishForm(owner, batchDraft.id, batchDraft.revision);
    for (let i = 0; i < 7; i++)
      submitForm(batch.publicToken!, {
        versionId: batch.publishedVersionId!,
        retryKey: randomUUID(),
        answers: { [amount]: "0.10", [text]: `Review batch ${i}` },
      });
    const processed = new Set<string>();
    let after: string | null = null;
    do {
      const query = new URLSearchParams({ reviewed: "new", limit: "3" });
      if (after) query.set("after", after);
      const batchPage = listFormResponses(owner, batch.id, query);
      for (const row of batchPage.items) {
        assert.equal(processed.has(row.id), false);
        processed.add(row.id);
        updateFormResponse(owner, batch.id, row.id, {
          revision: row.revision,
          reviewed: true,
        });
      }
      after = batchPage.next;
      if (after)
        assert.throws(
          () =>
            listFormResponses(
              owner,
              batch.id,
              new URLSearchParams({
                reviewed: "all",
                limit: "3",
                after: after!,
              }),
            ),
          /different query/,
        );
    } while (after);
    assert.equal(processed.size, 7);
    const { assignItemTags, taggedItems, favoriteItems } =
      await import("../src/lib/server/item-tags");
    const { searchWorkspace } =
      await import("../src/lib/server/unified-search");
    const { agentSearch } = await import("../src/lib/server/agent-search");
    const { agentCounts } = await import("../src/lib/server/agent-counts");
    const tag = randomUUID();
    database
      .prepare("INSERT INTO tags(id,name,color) VALUES(?,?,'gray')")
      .run(tag, "Forms test");
    const taggedForm = getForm(owner, batch.id);
    const tagged = assignItemTags(
      owner,
      "form",
      batch.id,
      taggedForm.revision,
      [tag],
    );
    assert.throws(
      () => assignItemTags(owner, "form", batch.id, taggedForm.revision, [tag]),
      /changed/,
    );
    assert.throws(
      () =>
        assignItemTags(randomUUID(), "form", batch.id, tagged.revision, [tag]),
      /not found/,
    );
    updateForm(owner, batch.id, { revision: tagged.revision, favorite: true });
    assert.equal(
      taggedItems(owner, tag, "Survey", 10, 0).items[0].type,
      "form",
    );
    assert.equal(favoriteItems(owner, "Survey", 10, 0).items[0].id, batch.id);
    assert.ok(
      searchWorkspace(owner, 'type:form tag:"Forms test" Survey').some(
        (item) => item.id === batch.id && item.type === "form",
      ),
    );
    assert.ok(
      agentSearch(owner, {
        query: 'type:form tag:"Forms test" Survey',
        limit: 10,
        offset: 0,
      }).items.some((item) => (item as { id: string }).id === batch.id),
    );
    assert.equal(
      agentCounts(owner, {
        state: "active",
        tagId: tag,
        favoritesOnly: true,
      }).counts.forms,
      1,
    );
    assert.equal(searchWorkspace(randomUUID(), "type:form Survey").length, 0);
    assert.equal(
      listFormResponses(
        owner,
        batch.id,
        new URLSearchParams({ reviewed: "new" }),
      ).total,
      0,
    );
    const { changeFormStatus, publicForm } =
      await import("../src/lib/server/forms");
    const { listTrash, restoreTrash, deleteTrash } =
      await import("../src/lib/server/trash");
    const { listForms } = await import("../src/lib/server/forms");
    for (let index = 0; index < 7; index++)
      createForm(owner, {
        definition: { ...definition, title: `Cursor form ${index}` },
      });
    const pagedForms = new Set<string>();
    let formCursor: string | null = null;
    do {
      const query = new URLSearchParams({
        q: "Cursor",
        status: "draft",
        limit: "3",
      });
      if (formCursor) query.set("after", formCursor);
      const page = listForms(owner, query);
      for (const item of page.items) {
        assert.equal(pagedForms.has(item.id), false);
        pagedForms.add(item.id);
        changeFormStatus(owner, item.id, item.revision, "trash");
      }
      formCursor = page.next;
    } while (formCursor);
    assert.equal(pagedForms.size, 7);

    updateFormResponse(owner, form.id, response.id, {
      revision: getFormResponse(owner, form.id, response.id).revision,
      trashed: true,
    });
    let deletedResponse = listTrash(owner, "", "form_response").items.find(
      (item) => item.id === response.id,
    )!;
    assert.ok(deletedResponse);
    assert.throws(() => formFile(owner, form.id, ready.id), /not found/);
    changeFormStatus(owner, form.id, getForm(owner, form.id).revision, "trash");
    let deletedForm = listTrash(owner, "", "form").items.find(
      (item) => item.id === form.id,
    )!;
    assert.ok(deletedForm);
    assert.throws(() => publicForm(token), /not available/);
    assert.throws(
      () =>
        restoreTrash(
          owner,
          "form_response",
          response.id,
          deletedResponse.revision,
        ),
      /Restore the form/,
    );
    assert.throws(
      () => restoreTrash(randomUUID(), "form", form.id, deletedForm.revision),
      /no longer in Trash/,
    );
    restoreTrash(owner, "form", form.id, deletedForm.revision);
    assert.equal(getForm(owner, form.id).status, "draft");
    assert.equal(getForm(owner, form.id).url, null);
    restoreTrash(owner, "form_response", response.id, deletedResponse.revision);
    assert.equal(
      (await storage.read(formFile(owner, form.id, ready.id).key)).toString(),
      "hello world",
    );
    const restoredPublication = publishForm(
      owner,
      form.id,
      getForm(owner, form.id).revision,
    );
    assert.notEqual(restoredPublication.publicToken, token);
    updateFormResponse(owner, form.id, response.id, {
      revision: getFormResponse(owner, form.id, response.id).revision,
      trashed: true,
    });
    deletedResponse = listTrash(owner, "", "form_response").items.find(
      (item) => item.id === response.id,
    )!;
    await deleteTrash(
      owner,
      "form_response",
      response.id,
      deletedResponse.revision,
    );
    await assert.rejects(storage.read(stored.key));
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS n FROM form_files WHERE response_id=?")
          .get(response.id) as { n: number }
      ).n,
      0,
    );
    changeFormStatus(owner, form.id, getForm(owner, form.id).revision, "trash");
    deletedForm = listTrash(owner, "", "form").items.find(
      (item) => item.id === form.id,
    )!;
    await deleteTrash(owner, "form", form.id, deletedForm.revision);
    await assert.rejects(storage.read(thumbnail.key));
    await assert.rejects(storage.read(thumbnail.thumbnail!));
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS n FROM form_responses WHERE form_id=?")
          .get(form.id) as { n: number }
      ).n,
      0,
    );
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS n FROM form_versions WHERE form_id=?")
          .get(form.id) as { n: number }
      ).n,
      0,
    );
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    await stopJobWorker();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
