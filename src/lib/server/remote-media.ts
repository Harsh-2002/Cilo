import { bookmarkUrl, fetchPublic, imageMime } from "./link-metadata";
import { fileResponse, mediaMime, memorySource } from "./file-response";
import { uploadLimit } from "./config";
import { HttpError } from "./http";

let active = 0;
const waiting: (() => void)[] = [];

export async function remoteMedia(
  request: Request,
  value: string,
  fetcher = fetchPublic,
) {
  const url = bookmarkUrl(value);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
  signal.throwIfAborted();
  if (active >= 2) {
    if (waiting.length >= 16)
      throw new HttpError(429, "Media requests are busy. Try again shortly.");
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        signal.removeEventListener("abort", cancel);
        resolve();
      };
      const cancel = () => {
        const index = waiting.indexOf(ready);
        if (index < 0) return;
        waiting.splice(index, 1);
        reject(new HttpError(504, "This media request timed out."));
      };
      signal.addEventListener("abort", cancel, { once: true });
      waiting.push(ready);
    });
  } else active++;
  try {
    signal.throwIfAborted();
    const result = await fetcher(
      url,
      uploadLimit(),
      signal,
      0,
      "image/*,audio/*,video/*",
    );
    const mime = imageMime(result.bytes) || mediaMime(result.bytes);
    if (!mime || mime === "image/x-icon")
      throw new HttpError(415, "This remote media format is not supported.");
    return await fileResponse(request, memorySource(result.bytes), {
      mime,
      name: "linked-media",
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "This linked media could not be loaded safely.");
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
