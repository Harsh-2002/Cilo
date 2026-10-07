import { parentPort, workerData } from "node:worker_threads";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { unzipSync } from "fflate";
import {
  getDocumentProxy,
  renderPageAsImage,
  createIsomorphicCanvasFactory,
} from "unpdf";
import { readFile } from "node:fs/promises";

sharp.concurrency(1);
sharp.cache(false);
const { file, mime } = workerData as { file: string; mime: string };
const maxPixels = 60_000_000;
async function videoFrame() {
  return new Promise<Buffer | null>((resolve) => {
    const child = spawn(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,ogg,avi",
        "-enable_drefs",
        "0",
        "-use_absolute_path",
        "0",
        "-i",
        file,
        "-frames:v",
        "1",
        "-an",
        "-sn",
        "-dn",
        "-vf",
        "scale=640:640:force_original_aspect_ratio=decrease",
        "-threads",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let size = 0;
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(
        code === 0 && size > 0 && size <= 2 * 1024 * 1024
          ? Buffer.concat(chunks)
          : null,
      );
    });
  });
}
async function run() {
  if (mime === "image/svg+xml") return { status: "none" };
  let source: string | Buffer = file;
  if (mime.startsWith("video/")) {
    const frame = await videoFrame();
    if (!frame) return { status: "none" };
    source = frame;
  } else if (mime === "application/pdf") {
    await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"));
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)), {
      maxImageSize: maxPixels,
    });
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const dimension = Math.max(viewport.width, viewport.height);
      if (!Number.isFinite(dimension) || dimension <= 0)
        return { status: "none" };
      source = Buffer.from(
        await renderPageAsImage(pdf, 1, {
          scale: Math.min(1, 640 / dimension),
          canvasImport: () => import("@napi-rs/canvas"),
        }),
      );
    } finally {
      await pdf.loadingTask.destroy();
    }
  }
  if (
    /^application\/vnd\.(openxmlformats-officedocument|oasis.opendocument)\./.test(
      mime,
    )
  ) {
    const archive = unzipSync(await readFile(file), {
      filter: (entry) =>
        [
          "docProps/thumbnail.jpeg",
          "docProps/thumbnail.jpg",
          "docProps/thumbnail.png",
          "Thumbnails/thumbnail.png",
        ].includes(entry.name) && entry.originalSize <= 2 * 1024 * 1024,
    });
    const embedded = Object.values(archive)[0];
    if (!embedded || embedded.length > 2 * 1024 * 1024)
      return { status: "none" };
    source = Buffer.from(embedded);
  }
  const image = sharp(source, { limitInputPixels: maxPixels, animated: false });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "gif", "webp", "tiff", "heif", "avif"].includes(
      metadata.format || "",
    )
  )
    return { status: "none" };
  let thumbnail = await image
    .clone()
    .rotate()
    .resize({
      width: 640,
      height: 640,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75, effort: 3 })
    .toBuffer();
  if (thumbnail.length > 128 * 1024)
    thumbnail = await image
      .clone()
      .rotate()
      .resize({
        width: 320,
        height: 320,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 60, effort: 3 })
      .toBuffer();
  if (thumbnail.length > 128 * 1024) return { status: "none" };
  return { status: "done", thumbnail };
}
void run()
  .then((result) => parentPort?.postMessage(result))
  .catch(() => parentPort?.postMessage({ status: "failed" }));
