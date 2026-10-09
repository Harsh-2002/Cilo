import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import Database from "better-sqlite3";
import { test } from "node:test";
import {
  formDefinitionSchema,
  changeFormFieldType,
  formFieldSchema,
  publishableForm,
  validateFormAnswers,
  confirmationVariables,
  editableConfirmation,
  encodeConfirmation,
  retargetConfirmation,
  renderFormConfirmation,
} from "../src/lib/forms";

test("confirmation answers use stable question references, typed labels and bounded plain text", () => {
  const fields = [
    "short_text",
    "email",
    "multiple_choice",
    "amount",
    "yes_no",
    "file",
    "heading",
  ].map((type) =>
    formFieldSchema.parse({
      id: randomUUID(),
      type,
      label: type === "short_text" || type === "email" ? "Contact" : type,
      choices: [
        { id: randomUUID(), label: "Design" },
        { id: randomUUID(), label: "Research" },
      ],
    }),
  );
  const [name, email, choice, amount, yes, file, heading] = fields;
  const token = (id: string) => `{{field:${id}}}`;
  const definition = formDefinitionSchema.parse({
    schemaVersion: 1,
    title: "Feedback",
    fields,
    confirmation: `Thanks ${token(name.id)}. ${token(email.id)} | ${token(choice.id)} | ${token(amount.id)} | ${token(yes.id)}`,
  });
  assert.equal(confirmationVariables(definition).length, 5);
  const editable = editableConfirmation(definition);
  assert.equal(
    formDefinitionSchema.parse({ ...definition, confirmation: "Thanks " })
      .confirmation,
    "Thanks ",
    "Autosave preserves the space before inserting an answer",
  );
  assert.equal(
    formDefinitionSchema.safeParse({ ...definition, confirmation: "  " })
      .success,
    false,
  );
  assert.match(editable, /\{\{1\. Contact\}\}/);
  assert.match(editable, /\{\{2\. Contact\}\}/);
  assert.equal(
    encodeConfirmation(definition, editable),
    definition.confirmation,
  );
  const renamed = {
    ...definition,
    fields: fields.map((field) =>
      field.id === name.id ? { ...field, label: "Full name" } : field,
    ),
  };
  assert.match(editableConfirmation(renamed), /\{\{1\. Full name\}\}/);
  const answers = {
    [name.id]: "<img src=x onerror=alert(1)>",
    [choice.id]: choice.choices.map((item) => item.id),
    [amount.id]: "19.95",
    [yes.id]: false,
  };
  assert.equal(
    renderFormConfirmation(renamed, answers),
    "Thanks <img src=x onerror=alert(1)>.  | Design, Research | 19.95 USD | No",
  );
  assert.equal(
    renderFormConfirmation(
      { ...definition, confirmation: token(email.id) },
      {},
    ),
    "Thank you. Your response has been submitted.",
  );
  assert.equal(
    renderFormConfirmation(
      { ...definition, confirmation: token(name.id) },
      { [name.id]: token(email.id), [email.id]: "private@example.test" },
    ),
    token(email.id),
    "Answers are not recursively interpreted",
  );
  for (const id of [file.id, heading.id, randomUUID(), "not-an-id"])
    assert.equal(
      formDefinitionSchema.safeParse({ ...definition, confirmation: token(id) })
        .success,
      false,
    );
  const replacement = changeFormFieldType(name, "email");
  const changed = {
    ...definition,
    fields: [replacement, ...fields.slice(1)],
    confirmation: retargetConfirmation(
      definition.confirmation,
      name.id,
      replacement.id,
    ),
  };
  assert.ok(formDefinitionSchema.safeParse(changed).success);
  assert.match(
    renderFormConfirmation(changed, { [replacement.id]: "new@example.test" }),
    /^Thanks new@example.test/,
  );
  const removed = {
    ...definition,
    fields: fields.slice(1),
    confirmation: retargetConfirmation(definition.confirmation, name.id),
  };
  assert.ok(formDefinitionSchema.safeParse(removed).success);
  assert.equal(
    renderFormConfirmation(
      { ...definition, confirmation: token(name.id).repeat(30) },
      { [name.id]: "a".repeat(10000) },
    ).length,
    20000,
  );
});

test("draft type changes preserve content and compatible settings with a new identity for historical definitions", () => {
  const original = formFieldSchema.parse({
    id: randomUUID(),
    type: "single_choice",
    label: "Choose one",
    description: "Help",
    required: true,
    choices: [
      { id: randomUUID(), label: "First" },
      { id: randomUUID(), label: "Second" },
    ],
    maxLength: 500,
  });
  const snapshot = JSON.stringify(original);
  const text = changeFormFieldType(original, "short_text");
  const dropdown = changeFormFieldType(text, "dropdown");
  assert.notEqual(dropdown.id, original.id);
  assert.notEqual(dropdown.id, text.id);
  assert.deepEqual(dropdown.choices, original.choices);
  assert.equal(dropdown.description, "Help");
  assert.equal(dropdown.required, true);
  assert.equal(dropdown.maxLength, 500);
  assert.equal(JSON.stringify(original), snapshot);
  assert.ok(formFieldSchema.safeParse(dropdown).success);
  const numeric = formFieldSchema.parse({
    id: randomUUID(),
    type: "number",
    label: "Score",
    minimum: 0.5,
    maximum: 100,
  });
  const rating = changeFormFieldType(numeric, "rating");
  assert.equal(rating.minimum, undefined);
  assert.equal(rating.maximum, undefined);
  assert.ok(formFieldSchema.safeParse(rating).success);
  const choice = changeFormFieldType(
    formFieldSchema.parse({
      id: randomUUID(),
      type: "email",
      label: "Contact",
    }),
    "multiple_choice",
  );
  assert.equal(choice.choices.length, 2);
  assert.equal(new Set(choice.choices.map((item) => item.id)).size, 2);
  assert.ok(formFieldSchema.safeParse(choice).success);
});

test("forms validate typed answers, exact amounts, choices and required consent", () => {
  const fields = [
    "amount",
    "rating",
    "multiple_choice",
    "consent",
    "date",
    "url",
    "file",
  ].map((type) =>
    formFieldSchema.parse({
      id: randomUUID(),
      type,
      label: type,
      required: true,
      choices:
        type === "multiple_choice" ? [{ id: randomUUID(), label: "A" }] : [],
    }),
  );
  const definition = formDefinitionSchema.parse({
    schemaVersion: 1,
    title: "Survey",
    fields,
  });
  assert.equal(publishableForm(definition), true);
  const [amount, rating, choices, consent, date, url, file] = fields.map(
    (field) => field.id,
  );
  const answers = {
    [amount]: "12.30",
    [rating]: 3,
    [choices]: [fields[2].choices[0].id],
    [consent]: true,
    [date]: "2026-10-09",
    [url]: "https://example.com",
    [file]: [randomUUID()],
  };
  assert.deepEqual(validateFormAnswers(definition, answers).errors, {});
  const invalid = {
    ...answers,
    [amount]: 12.3,
    [rating]: 3.5,
    [choices]: [randomUUID()],
    [consent]: false,
    [date]: "2026-02-30",
    [url]: "javascript:alert(1)",
    [file]: ["foreign-file"],
  };
  assert.equal(
    Object.keys(validateFormAnswers(definition, invalid).errors).length,
    fields.length,
  );
  assert.equal(
    Object.keys(validateFormAnswers(definition, {}).errors).length,
    fields.length,
  );
  assert.ok(
    validateFormAnswers(definition, { ...answers, [randomUUID()]: "injected" })
      .errors.form,
  );
});

test("draft identities and published definitions reject ambiguous questions", () => {
  const field = formFieldSchema.parse({
    id: randomUUID(),
    type: "single_choice",
    label: "Choose",
  });
  const definition = formDefinitionSchema.parse({
    schemaVersion: 1,
    title: "Draft",
    fields: [field],
  });
  assert.equal(publishableForm(definition), false);
  assert.equal(
    formDefinitionSchema.safeParse({ ...definition, fields: [field, field] })
      .success,
    false,
  );
  const choice = { id: randomUUID(), label: "One" };
  assert.equal(
    formFieldSchema.safeParse({ ...field, choices: [choice, choice] }).success,
    false,
  );
  assert.equal(
    formFieldSchema.safeParse({ ...field, minimum: 10, maximum: 1 }).success,
    false,
  );
});

test("forms migration upgrades existing data and binds versions/files to their parent", async () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  try {
    for (const name of (await readdir("migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort())
      db.exec(await readFile(`migrations/${name}`, "utf8"));
    db.exec(
      "INSERT INTO user(id,name,email,username,created_at,updated_at) VALUES('owner','Owner','owner@local.invalid','owner',1,1)",
    );
    const definition = JSON.stringify({
      schemaVersion: 1,
      title: "Survey",
      description: "Trip planning",
      fields: [],
    });
    db.prepare(
      "INSERT INTO forms(id,owner_id,title,description,definition,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
    ).run("one", "owner", "Survey", "Trip planning", definition);
    db.prepare(
      "INSERT INTO forms(id,owner_id,title,definition,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).run("two", "owner", "Other", definition);
    db.prepare("INSERT INTO form_versions VALUES('version','one',1,?,1)").run(
      definition,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO form_responses(id,form_id,version_id,answers,retry_key,request_hash,created_at) VALUES('bad','two','version','{}','retry','hash',1)",
          )
          .run(),
      /FOREIGN KEY/,
    );
    db.exec(
      "INSERT INTO form_responses(id,form_id,version_id,answers,search_text,retry_key,request_hash,created_at) VALUES('response','one','version','{}','Seaside','retry','hash',1)",
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT count(*) AS n FROM forms_fts WHERE forms_fts MATCH 'planning'",
          )
          .get() as { n: number }
      ).n,
      1,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT count(*) AS n FROM form_responses_fts WHERE form_responses_fts MATCH 'Seaside'",
          )
          .get() as { n: number }
      ).n,
      1,
    );
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO form_responses(id,form_id,version_id,answers,retry_key,request_hash,created_at) VALUES('duplicate','one','version','{}','retry','hash',1)",
        ),
      /UNIQUE/,
    );
    assert.throws(
      () =>
        db.exec("UPDATE form_versions SET definition='{}' WHERE id='version'"),
      /immutable/,
    );
    assert.throws(
      () =>
        db.exec("UPDATE form_responses SET answers='{}' WHERE id='response'"),
      /immutable/,
    );
    db.exec(
      "UPDATE form_responses SET reviewed=1,revision=revision+1 WHERE id='response'",
    );
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    db.close();
  }
});
