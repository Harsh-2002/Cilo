export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await fetch(`/api/nivra/${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = await result.json();
  if (!result.ok)
    throw new ApiError(
      body.error || "This action could not be completed.",
      result.status,
    );
  return body;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadRequest(
  path: string,
  name: string,
  init?: RequestInit,
) {
  const result = await fetch(`/api/nivra/${path}`, init);
  if (!result.ok) {
    const body = await result.json();
    throw new Error(body.error);
  }
  download(await result.blob(), name);
}
export async function authRequest(path: string, data: Record<string, unknown>) {
  const result = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await result.json();
  if (!result.ok)
    throw new Error(
      body.message || "Please check your credentials and try again.",
    );
  return body;
}
