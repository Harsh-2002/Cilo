import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { formDefinitionSchema, type FormAnswer } from "../forms";
import { db, sqlite } from "./db";
import { formResponses, formVersions } from "./schema";
import { getForm } from "./forms";
import { HttpError } from "./http";
import { createHash } from "node:crypto";
import { decodeCursor, encodeCursor } from "./pagination";
import { ftsQuery } from "./validation";
import { completionEvent } from "./jobs";
import { installationUrl } from "./installation";
import { dateSchema, zoneSchema, zoneDay, addDays } from "../calendar";

export const formResponseQuery = z
  .object({
    q: z.string().max(300).default(""),
    reviewed: z.enum(["all", "new", "reviewed"]).default("all"),
    versionId: z.string().uuid().optional(),
    date: dateSchema.optional(),
    timezone: zoneSchema.default("UTC"),
    limit: z.coerce.number().int().min(1).max(100).default(60),
    after: z.string().max(400).optional(),
  })
  .strict();
function responseFilter(formId: string, query: URLSearchParams) {
  const input = formResponseQuery.parse(Object.fromEntries(query));
  const where = ["r.form_id=?", "r.trashed_at IS NULL"];
  const values: (string | number)[] = [formId];
  if (input.date) {
    where.push("r.created_at>=? AND r.created_at<?");
    values.push(
      zoneDay(input.date, input.timezone),
      zoneDay(addDays(input.date, 1), input.timezone),
    );
  }
  if (input.reviewed !== "all") {
    where.push("r.reviewed=?");
    values.push(input.reviewed === "reviewed" ? 1 : 0);
  }
  if (input.versionId) {
    where.push("r.version_id=?");
    values.push(input.versionId);
  }
  const search = ftsQuery(input.q);
  if (search) {
    where.push("form_responses_fts MATCH ?");
    values.push(search);
  }
  return {
    where: where.join(" AND "),
    values,
    source: search
      ? "form_responses r JOIN form_responses_fts ON form_responses_fts.rowid=r.rowid"
      : "form_responses r",
  };
}
export function listFormResponses(
  owner: string,
  formId: string,
  query = new URLSearchParams(),
) {
  getForm(owner, formId);
  const filter = responseFilter(formId, query);
  const input = formResponseQuery.parse(Object.fromEntries(query));
  const { after, ...filters } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ owner, formId, ...filters }))
    .digest("hex")
    .slice(0, 24);
  const cursor = decodeCursor(after ?? null, ["number", "string", "string"]);
  if (cursor && cursor[2] !== fingerprint)
    throw new HttpError(400, "This cursor belongs to a different query.");
  if (cursor) {
    z.number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .parse(cursor[0]);
    z.string().uuid().parse(cursor[1]);
  }
  const limit = input.limit;
  const total = (
    sqlite()
      .prepare(
        `SELECT count(*) AS total FROM ${filter.source} WHERE ${filter.where}`,
      )
      .get(...filter.values) as { total: number }
  ).total;
  const rows = sqlite()
    .prepare(
      `SELECT r.id,r.version_id AS versionId,r.reviewed,r.revision,r.created_at AS createdAt,substr(r.search_text,1,180) AS preview FROM ${filter.source} WHERE ${filter.where}${cursor ? " AND (r.created_at,r.id)<(?,?)" : ""} ORDER BY r.created_at DESC,r.id DESC LIMIT ?`,
    )
    .all(
      ...filter.values,
      ...(cursor ? [cursor[0], cursor[1]] : []),
      limit + 1,
    ) as {
    id: string;
    versionId: string;
    reviewed: number;
    revision: number;
    createdAt: number;
    preview: string;
  }[];
  const selected = rows.slice(0, limit),
    last = selected.at(-1);
  return {
    items: selected.map((row) => ({ ...row, reviewed: !!row.reviewed })),
    total,
    next:
      rows.length > limit && last
        ? encodeCursor([last.createdAt, last.id, fingerprint])
        : null,
    nextOffset: null,
  };
}
function responseFiles(formId: string, responseId: string, agentFiles = false) {
  const files = sqlite()
    .prepare(
      "SELECT id,field_id AS fieldId,filename,mime,size,thumb_key IS NOT NULL AS hasThumbnail FROM form_files WHERE response_id=? AND form_id=? AND state='attached'",
    )
    .all(responseId, formId) as {
    id: string;
    fieldId: string;
    filename: string;
    mime: string;
    size: number;
    hasThumbnail: number;
  }[];
  const baseUrl = installationUrl();
  if (!baseUrl)
    throw new HttpError(
      503,
      "Configure the installation URL before downloading files.",
    );
  return files.map((file) => ({
    ...file,
    hasThumbnail: !!file.hasThumbnail,
    url: agentFiles
      ? `${baseUrl}/mcp/files/form-file/${formId}/${file.id}`
      : `${baseUrl}/api/v1/forms/${formId}/files/${file.id}`,
  }));
}
export function getFormResponse(
  owner: string,
  formId: string,
  responseId: string,
) {
  getForm(owner, formId);
  const response = db()
    .select()
    .from(formResponses)
    .where(
      and(
        eq(formResponses.id, responseId),
        eq(formResponses.formId, formId),
        isNull(formResponses.trashedAt),
      ),
    )
    .get();
  if (!response) throw new HttpError(404, "Response not found.");
  const version = db()
    .select()
    .from(formVersions)
    .where(
      and(
        eq(formVersions.id, response.versionId),
        eq(formVersions.formId, formId),
      ),
    )
    .get();
  if (!version) throw new HttpError(404, "Response version not found.");
  return {
    id: response.id,
    formId,
    versionId: response.versionId,
    answers: response.answers,
    reviewed: response.reviewed,
    revision: response.revision,
    createdAt: response.createdAt,
    definition: version.definition,
    files: responseFiles(formId, responseId),
  };
}
export function updateFormResponse(
  owner: string,
  formId: string,
  responseId: string,
  input: unknown,
) {
  const value = z
    .object({
      revision: z.number().int().positive(),
      reviewed: z.boolean().optional(),
      trashed: z.literal(true).optional(),
    })
    .strict()
    .parse(input);
  sqlite()
    .transaction(() => {
      const current = getFormResponse(owner, formId, responseId);
      if (current.revision !== value.revision)
        throw new HttpError(
          409,
          "This response changed. Reload before continuing.",
        );
      db()
        .update(formResponses)
        .set({
          revision: current.revision + 1,
          ...(value.reviewed === undefined ? {} : { reviewed: value.reviewed }),
          ...(value.trashed ? { trashedAt: Date.now() } : {}),
        })
        .where(
          and(
            eq(formResponses.id, responseId),
            eq(formResponses.formId, formId),
          ),
        )
        .run();
      completionEvent(owner, "content", formId, "forms");
    })
    .immediate();
  return value.trashed
    ? { ok: true }
    : getFormResponse(owner, formId, responseId);
}
export function formSummary(owner: string, formId: string) {
  const form = getForm(owner, formId);
  const versions = sqlite()
    .prepare(
      "SELECT v.id,v.definition,v.created_at AS createdAt,count(r.id) AS total FROM form_versions v JOIN form_responses r ON r.version_id=v.id AND r.form_id=v.form_id AND r.trashed_at IS NULL WHERE v.form_id=? GROUP BY v.id ORDER BY v.created_at DESC,v.id DESC",
    )
    .all(formId) as {
    id: string;
    definition: string;
    createdAt: number;
    total: number;
  }[];
  return {
    total: form.total,
    newCount: form.newCount,
    versions: versions.map((version) => {
      const definition = formDefinitionSchema.parse(
        JSON.parse(version.definition),
      );
      const fields = definition.fields.filter(
        (field) => !["heading", "description", "section"].includes(field.type),
      );
      const aggregates = new Map(
        fields.map((field) => [
          field.id,
          {
            answered: 0,
            sum: 0,
            minimum: null as number | null,
            maximum: null as number | null,
            cents: BigInt(0),
            fileCount: 0,
            distribution: {} as Record<string, number>,
          },
        ]),
      );
      const rows = sqlite()
        .prepare(
          "SELECT answers FROM form_responses WHERE form_id=? AND version_id=? AND trashed_at IS NULL",
        )
        .iterate(formId, version.id) as Iterable<{ answers: string }>;
      for (const row of rows) {
        const answers = JSON.parse(row.answers) as Record<string, FormAnswer>;
        for (const field of fields) {
          const value = answers[field.id];
          if (
            value === undefined ||
            value === "" ||
            (Array.isArray(value) && !value.length)
          )
            continue;
          const aggregate = aggregates.get(field.id)!;
          aggregate.answered++;
          if (["number", "rating"].includes(field.type)) {
            const number = Number(value);
            aggregate.sum += number;
            aggregate.minimum =
              aggregate.minimum === null
                ? number
                : Math.min(aggregate.minimum, number);
            aggregate.maximum =
              aggregate.maximum === null
                ? number
                : Math.max(aggregate.maximum, number);
          }
          if (field.type === "amount") {
            const raw = String(value),
              negative = raw.startsWith("-");
            const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
            aggregate.cents +=
              (negative ? -BigInt(1) : BigInt(1)) *
              (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
          }
          if (field.type === "file" && Array.isArray(value))
            aggregate.fileCount += value.length;
          if (
            [
              "single_choice",
              "dropdown",
              "multiple_choice",
              "rating",
              "yes_no",
              "consent",
            ].includes(field.type)
          )
            for (const choice of Array.isArray(value) ? value : [String(value)])
              aggregate.distribution[choice] =
                (aggregate.distribution[choice] ?? 0) + 1;
        }
      }
      return {
        id: version.id,
        createdAt: version.createdAt,
        title: definition.title,
        total: version.total,
        fields: fields.map((field) => {
          const {
            answered,
            sum,
            minimum,
            maximum,
            cents,
            fileCount,
            distribution,
          } = aggregates.get(field.id)!;
          const amount = `${cents < BigInt(0) ? "-" : ""}${(cents < BigInt(0) ? -cents : cents) / BigInt(100)}.${String((cents < BigInt(0) ? -cents : cents) % BigInt(100)).padStart(2, "0")}`;
          return {
            id: field.id,
            label: field.label,
            type: field.type,
            choices: field.choices,
            currency: field.currency,
            answered,
            distribution,
            ...(field.type === "amount" ? { sum: amount } : {}),
            ...(["number", "rating"].includes(field.type)
              ? {
                  sum,
                  average: answered ? sum / answered : null,
                  minimum,
                  maximum,
                }
              : {}),
            ...(field.type === "file" ? { fileCount } : {}),
          };
        }),
      };
    }),
  };
}
export function* exportFormResponses(
  owner: string,
  formId: string,
  query: URLSearchParams,
  agentFiles = false,
) {
  getForm(owner, formId);
  const filter = responseFilter(formId, query);
  const rows = sqlite()
    .prepare(
      `SELECT r.id,r.version_id AS versionId,r.answers,r.reviewed,r.created_at AS createdAt,v.definition FROM ${filter.source} JOIN form_versions v ON v.id=r.version_id AND v.form_id=r.form_id WHERE ${filter.where} ORDER BY r.created_at DESC,r.id DESC`,
    )
    .iterate(...filter.values) as Iterable<{
    id: string;
    versionId: string;
    answers: string;
    reviewed: number;
    createdAt: number;
    definition: string;
  }>;
  for (const row of rows) {
    const definition = formDefinitionSchema.parse(JSON.parse(row.definition));
    yield {
      id: row.id,
      formId,
      files: responseFiles(formId, row.id, agentFiles),
      versionId: row.versionId,
      reviewed: !!row.reviewed,
      createdAt: row.createdAt,
      definition,
      answers: JSON.parse(row.answers) as Record<string, FormAnswer>,
    };
  }
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function* exportFormCsv(
  owner: string,
  formId: string,
  query = new URLSearchParams(),
) {
  yield [
    "Response",
    "Version",
    "Submitted at",
    "Reviewed",
    "Question ID",
    "Question",
    "Answer",
  ]
    .map(csvCell)
    .join(",") + "\r\n";
  for (const response of exportFormResponses(owner, formId, query)) {
    for (const field of response.definition.fields) {
      if (["heading", "description", "section"].includes(field.type)) continue;
      const answer = response.answers[field.id];
      const label = (value: string) =>
        field.type === "file"
          ? (response.files.find((file) => file.id === value)?.filename ??
            value)
          : (field.choices.find((choice) => choice.id === value)?.label ??
            value);
      const value = Array.isArray(answer)
        ? answer.map(label).join("; ")
        : typeof answer === "string"
          ? label(answer)
          : answer;
      yield [
        response.id,
        response.versionId,
        new Date(response.createdAt).toISOString(),
        response.reviewed ? "Yes" : "No",
        field.id,
        field.label,
        value ?? "",
      ]
        .map(csvCell)
        .join(",") + "\r\n";
    }
  }
}
export function* exportFormJson(
  owner: string,
  formId: string,
  query = new URLSearchParams(),
  agentFiles = false,
) {
  yield "[";
  let first = true;
  for (const response of exportFormResponses(
    owner,
    formId,
    query,
    agentFiles,
  )) {
    yield `${first ? "" : ","}${JSON.stringify(response)}`;
    first = false;
  }
  yield "]";
}
