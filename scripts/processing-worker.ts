import { parentPort, workerData } from "node:worker_threads";
import { extractText, imageInfo, pdfText } from "../src/lib/server/extract";
import { recognize } from "../src/lib/server/ocr-engine";
async function run() {
  const { bytes, name, mime } = workerData as {
    bytes: Uint8Array;
    name: string;
    mime: string;
  };
  const image = imageInfo(bytes);
  if (image) {
    if (image.width * image.height > 60_000_000)
      throw new Error("Image exceeds recognition limit.");
    return { text: await recognize(bytes), status: "done" };
  }
  if (mime === "application/pdf") {
    const text = await pdfText(bytes);
    return { text: text ?? "", status: text === null ? "failed" : "done" };
  }
  const text = extractText(name, mime, bytes);
  return { text: text ?? "", status: text === null ? "none" : "done" };
}
void run()
  .then((result) => parentPort?.postMessage(result))
  .catch(() => parentPort?.postMessage({ error: true }));
