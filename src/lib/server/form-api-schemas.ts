import { z } from "zod";
import {
  formAnswersSchema,
  formDefinitionSchema,
  formDeadlineSchema,
  formFieldSchema,
} from "../forms";
import { formListQuery, formSubmissionSchema, formUpdateSchema } from "./forms";
import { formResponseQuery } from "./form-results";
import type { ApiOperation } from "./api-contract";
const id = z.string().uuid(),
  revision = z.object({ revision: z.number().int().positive() }).strict();
const status = z.enum(["draft", "published", "closed"]);
const summary = z.object({
  id,
  title: z.string(),
  description: z.string(),
  status,
  revision: z.number().int().positive(),
  favorite: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  total: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  lastSubmittedAt: z.number().nullable(),
  closesAt: z.number().nullable(),
});
export const formOutput = summary.extend({
  ownerId: z.string(),
  definition: formDefinitionSchema,
  tags: z.array(z.object({ id, name: z.string(), color: z.string() })),
  publishedRevision: z.number().int().positive().nullable(),
  hasUnpublishedChanges: z.boolean(),
  publicToken: z.string().nullable(),
  publishedVersionId: id.nullable(),
  uploadBudget: z.number().int().nonnegative(),
  deadline: formDeadlineSchema.nullable(),
  trashedAt: z.number().nullable(),
  url: z.url().nullable(),
});
const page = (item: z.ZodType) =>
  z.object({
    items: z.array(item).max(100),
    total: z.number().int().nonnegative(),
    next: z.string().nullable(),
    nextOffset: z.number().int().nonnegative().nullable(),
  });
const responseSummary = z.object({
  id,
  versionId: id,
  reviewed: z.boolean(),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  preview: z.string(),
});
const file = z.object({
  id,
  fieldId: id,
  filename: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  hasThumbnail: z.boolean(),
  url: z.url(),
});
const responseDetail = responseSummary.omit({ preview: true }).extend({
  formId: id,
  definition: formDefinitionSchema,
  answers: formAnswersSchema,
  files: z.array(file),
});
const fieldSummary = z.object({
  id,
  label: z.string(),
  type: formFieldSchema.shape.type,
  choices: formFieldSchema.shape.choices,
  currency: z.string(),
  answered: z.number().int().nonnegative(),
  distribution: z.record(z.string(), z.number().int().nonnegative()),
  sum: z.union([z.string(), z.number()]).optional(),
  average: z.number().nullable().optional(),
  minimum: z.number().nullable().optional(),
  maximum: z.number().nullable().optional(),
  fileCount: z.number().int().nonnegative().optional(),
});
const results = z.object({
  total: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  versions: z.array(
    z.object({
      id,
      title: z.string(),
      createdAt: z.number(),
      total: z.number().int().nonnegative(),
      fields: z.array(fieldSummary),
    }),
  ),
});
const ok = z.object({ ok: z.literal(true) });
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const reservation = z
  .object({
    secret,
    fieldId: id,
    filename: z.string().min(1).max(200),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();
export const formApiInputs = {
  create: z
    .object({
      definition: formDefinitionSchema.optional(),
      deadline: formDeadlineSchema.nullable().optional(),
    })
    .strict(),
  revision,
  update: formUpdateSchema,
  responseUpdate: z
    .object({ revision: z.number().int().positive(), reviewed: z.boolean() })
    .strict(),
  uploadSession: z.object({ versionId: id }).strict(),
  reservation,
  secret: z.object({ secret }).strict(),
};
function operation(
  path: string,
  method: string,
  summary: string,
  output: z.ZodType,
  options: Partial<ApiOperation> = {},
): ApiOperation {
  return {
    path: `/api/v1/${path}`,
    method,
    summary,
    output,
    status: 200,
    access: "content",
    ...options,
  };
}
export const formApiOperations = [
  operation("forms", "GET", "List forms, newest first", page(summary), {
    query: formListQuery,
  }),
  operation("forms", "POST", "Create a draft form", formOutput, {
    input: formApiInputs.create,
    status: 201,
    optionalBody: true,
  }),
  operation("forms/{id}", "GET", "Read a form", formOutput),
  operation(
    "forms/{id}",
    "PATCH",
    "Update a form draft with its current revision",
    formOutput,
    { input: formUpdateSchema },
  ),
  operation(
    "forms/{id}",
    "DELETE",
    "Move a form to Trash and revoke its public link",
    ok,
    { input: revision },
  ),
  operation(
    "forms/{id}/duplicate",
    "POST",
    "Duplicate a definition as a new draft",
    formOutput,
    { status: 201 },
  ),
  ...(["publish", "close", "reopen", "unpublish"] as const).map((action) =>
    operation(
      `forms/{id}/${action}`,
      "POST",
      `${action[0].toUpperCase() + action.slice(1)} a form`,
      formOutput,
      { input: revision },
    ),
  ),
  operation(
    "forms/{id}/responses",
    "GET",
    "List submissions with exact filtered counts",
    page(responseSummary),
    { query: formResponseQuery },
  ),
  operation(
    "forms/{id}/responses/{responseId}",
    "GET",
    "Read a submission and its published definition",
    responseDetail,
  ),
  operation(
    "forms/{id}/responses/{responseId}",
    "PATCH",
    "Mark a submission reviewed or new",
    responseDetail,
    { input: formApiInputs.responseUpdate },
  ),
  operation(
    "forms/{id}/responses/{responseId}",
    "DELETE",
    "Move a submission to Trash",
    ok,
    { input: revision },
  ),
  operation(
    "forms/{id}/summary",
    "GET",
    "Read submission summaries by published version",
    results,
  ),
  operation(
    "forms/{id}/export/{format}",
    "GET",
    "Export all filtered submissions as CSV or JSON",
    z.unknown(),
    { query: formResponseQuery, binary: "application/octet-stream" },
  ),
  operation(
    "forms/{id}/files/{fileId}",
    "GET",
    "Download a submission file or thumbnail",
    z.unknown(),
    {
      binary: "application/octet-stream",
      query: z
        .object({
          thumbnail: z.enum(["0", "1"]).optional(),
          download: z.enum(["0", "1"]).optional(),
        })
        .strict(),
    },
  ),
  operation(
    "public/forms/{token}",
    "GET",
    "Read a published form definition",
    z.object({
      status: z.enum(["published", "closed"]),
      versionId: id,
      definition: formDefinitionSchema,
      maxFileBytes: z.number().int().positive(),
      maxResponseBytes: z.number().int().positive(),
    }),
    { access: "public" },
  ),
  operation(
    "public/forms/{token}/responses",
    "POST",
    "Submit answers with a retry key",
    z.object({
      id,
      confirmation: z
        .string()
        .max(20000)
        .describe(
          "Plain-text confirmation rendered from the submitted published version and validated answers.",
        ),
    }),
    { access: "public", status: 201, input: formSubmissionSchema },
  ),
  operation(
    "public/forms/{token}/sessions",
    "POST",
    "Start a form-bound temporary upload session",
    z.object({ secret, expiresAt: z.number() }),
    { access: "public", status: 201, input: formApiInputs.uploadSession },
  ),
  operation(
    "public/forms/{token}/uploads",
    "POST",
    "Reserve bounded attachment storage",
    z.object({ id, size: z.number().int().positive() }),
    { access: "public", status: 201, input: reservation },
  ),
  operation(
    "public/forms/{token}/uploads/{fileId}",
    "PUT",
    "Store reserved file bytes using X-Form-Upload session secret",
    z.object({
      id,
      filename: z.string(),
      mime: z.string(),
      size: z.number().int().positive(),
    }),
    { access: "public", binaryInput: "application/octet-stream" },
  ),
  operation(
    "public/forms/{token}/uploads/{fileId}",
    "DELETE",
    "Remove an unsubmitted temporary file",
    ok,
    { access: "public", input: formApiInputs.secret },
  ),
];
