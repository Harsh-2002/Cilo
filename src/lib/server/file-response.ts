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
export type FileSource = {
  size: number;
  release?: () => Promise<void>;
  // Both bounds are inclusive byte offsets.
  read(start: number, end: number): Promise<Uint8Array>;
};
export const memorySource = (bytes: Uint8Array): FileSource => ({
  size: bytes.length,
  read: async (start, end) => bytes.subarray(start, end + 1),
});
const streamStep = 1024 * 1024;
async function body(source: FileSource, start: number, end: number) {
  if (end - start < streamStep) {
    try {
      return (await source.read(start, end)) as Uint8Array<ArrayBuffer>;
    } finally {
      await source.release?.();
    }
  }
  let position = start;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const last = Math.min(end, position + streamStep - 1);
        controller.enqueue(await source.read(position, last));
        position = last + 1;
        if (position > end) {
          await source.release?.();
          controller.close();
        }
      } catch (error) {
        await source.release?.();
        controller.error(error);
      }
    },
    cancel: () => source.release?.(),
  });
}
export function mediaMime(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.subarray(0, 12));
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE")
    return "audio/wav";
  if (header.startsWith("ID3")) return "audio/mpeg";
  if (
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    (bytes[1] & 0x06) !== 0
  )
    return "audio/mpeg";
  if (header.startsWith("fLaC")) return "audio/flac";
  if (header.startsWith("OggS")) return "audio/ogg";
  if (header.slice(4, 8) === "ftyp") {
    const brand = header.slice(8, 12);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)$/.test(brand))
      return undefined;
    if (/^M4[ABP] $/.test(brand)) return "audio/mp4";
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V |qt  |dash)$/.test(brand))
      return "video/mp4";
  }
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm";
  return undefined;
}
export async function fileResponse(
  request: Request,
  source: FileSource,
  file: { mime: string; name: string },
  published = false,
) {
  try {
    const length = source.size;
    const mime =
      file.mime === "application/octet-stream" && length
        ? mediaMime(await source.read(0, 11)) || file.mime
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
      headers.set("Content-Length", String(length));
      if (!length) await source.release?.();
      return new Response(length ? await body(source, 0, length - 1) : null, {
        headers,
      });
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1]
      ? Number(match[1])
      : Math.max(0, length - Number(match?.[2]));
    const end =
      match?.[1] && match[2]
        ? Math.min(Number(match[2]), length - 1)
        : length - 1;
    if (
      !match ||
      match
        .slice(1)
        .some((value) => value && !Number.isSafeInteger(Number(value))) ||
      (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= length ||
      end < start ||
      (!match[1] && Number(match[2]) <= 0)
    ) {
      headers.set("Content-Range", `bytes */${length}`);
      await source.release?.();
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${length}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(await body(source, start, end), {
      status: 206,
      headers,
    });
  } catch (error) {
    await source.release?.();
    throw error;
  }
}
