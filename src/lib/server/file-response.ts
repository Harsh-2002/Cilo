export const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "file";
const inlineTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/ogg",
]);
function mediaMime(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.subarray(0, 12));
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE")
    return "audio/wav";
  if (header.startsWith("ID3")) return "audio/mpeg";
  if (header.startsWith("fLaC")) return "audio/flac";
  if (header.startsWith("OggS")) return "audio/ogg";
  if (header.slice(4, 8) === "ftyp") return "video/mp4";
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm";
  return undefined;
}
export function fileResponse(
  request: Request,
  bytes: Uint8Array,
  file: { mime: string; name: string },
  published = false,
) {
  const mime =
    file.mime === "application/octet-stream"
      ? mediaMime(bytes) || file.mime
      : file.mime;
  const inline = inlineTypes.has(mime);
  const headers = new Headers({
    "Content-Type": inline ? mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName(file.name)}"`,
    "Cache-Control": published ? "no-store" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Accept-Ranges": "bytes",
  });
  const range = request.headers.get("range");
  if (!range || request.headers.has("if-range")) {
    headers.set("Content-Length", String(bytes.length));
    return new Response(new Uint8Array(bytes), { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1]
    ? Number(match[1])
    : Math.max(0, bytes.length - Number(match?.[2]));
  const end =
    match?.[1] && match[2]
      ? Math.min(Number(match[2]), bytes.length - 1)
      : bytes.length - 1;
  if (
    !match ||
    match
      .slice(1)
      .some((value) => value && !Number.isSafeInteger(Number(value))) ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= bytes.length ||
    end < start ||
    (!match[1] && Number(match[2]) <= 0)
  ) {
    headers.set("Content-Range", `bytes */${bytes.length}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: 206,
    headers,
  });
}
