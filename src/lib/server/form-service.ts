import type { ContentCommand, ContentResult } from "./content-service";
import {
  changeFormStatus,
  createForm,
  duplicateForm,
  getForm,
  listForms,
  publishForm,
  updateForm,
} from "./forms";
import {
  exportFormCsv,
  exportFormJson,
  formSummary,
  getFormResponse,
  listFormResponses,
  updateFormResponse,
} from "./form-results";
import { formFile } from "./form-uploads";
import { formApiInputs } from "./form-api-schemas";
import { storedFileResponse } from "./storage";
import { HttpError } from "./http";
const result = (data: unknown, status = 200): ContentResult => ({
  data,
  status,
});
function exportStream(iterator: Generator<string>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        const next = iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        iterator.return(undefined);
        controller.error(error);
      }
    },
    cancel() {
      iterator.return(undefined);
    },
  });
}
export async function executeForms(
  command: ContentCommand,
): Promise<ContentResult> {
  const { ownerId: owner, method, input, transport } = command;
  const [, id, action, target] = command.path;
  const query = command.query ?? new URLSearchParams();
  if (!id && method === "GET") return result(listForms(owner, query));
  if (!id && method === "POST")
    return result(createForm(owner, input ?? {}), 201);
  if (id && !action) {
    if (method === "GET") return result(getForm(owner, id));
    if (method === "PATCH") return result(updateForm(owner, id, input));
    if (method === "DELETE")
      return result(
        changeFormStatus(
          owner,
          id,
          formApiInputs.revision.parse(input).revision,
          "trash",
        ),
      );
  }
  if (id && method === "POST") {
    if (action === "duplicate") return result(duplicateForm(owner, id), 201);
    const revision = formApiInputs.revision.parse(input).revision;
    if (action === "publish") return result(publishForm(owner, id, revision));
    if (action === "close" || action === "reopen" || action === "unpublish")
      return result(changeFormStatus(owner, id, revision, action));
  }
  if (id && action === "summary" && method === "GET")
    return result(formSummary(owner, id));
  if (id && action === "responses") {
    if (!target && method === "GET")
      return result(listFormResponses(owner, id, query));
    if (target && method === "GET")
      return result(getFormResponse(owner, id, target));
    if (target && method === "PATCH")
      return result(updateFormResponse(owner, id, target, input));
    if (target && method === "DELETE")
      return result(
        updateFormResponse(owner, id, target, {
          ...formApiInputs.revision.parse(input),
          trashed: true,
        }),
      );
  }
  if (id && action === "files" && target && method === "GET") {
    if (!transport)
      throw new HttpError(
        400,
        "Use the authenticated file URL to download this attachment.",
      );
    const file = formFile(owner, id, target),
      thumbnail = query.get("thumbnail") === "1";
    if (thumbnail && !file.thumbnail)
      throw new HttpError(404, "Thumbnail not available.");
    return {
      response: await storedFileResponse(
        transport,
        thumbnail ? file.thumbnail! : file.key,
        {
          mime: thumbnail ? "image/webp" : file.mime,
          name: thumbnail ? "preview.webp" : file.filename,
        },
      ),
    };
  }
  if (
    id &&
    action === "export" &&
    method === "GET" &&
    (target === "csv" || target === "json")
  ) {
    getForm(owner, id);
    const iterator =
      target === "csv"
        ? exportFormCsv(owner, id, query)
        : exportFormJson(
            owner,
            id,
            query,
            !!transport && new URL(transport.url).pathname.startsWith("/mcp/"),
          );
    return {
      response: new Response(exportStream(iterator), {
        headers: {
          "Content-Type":
            target === "csv" ? "text/csv; charset=utf-8" : "application/json",
          "Content-Disposition": `attachment; filename="form-responses.${target}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }),
    };
  }
  throw new HttpError(404, "Form operation not found.");
}
