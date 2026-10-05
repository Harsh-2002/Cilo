export function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}
// Grid previews are made in the browser so the server needs no image library.
export async function makeThumbnail(file: Blob): Promise<Blob | null> {
  if (!/^image\/(png|jpeg|webp|gif)$|^video\/(mp4|webm|ogg)$/.test(file.type))
    return null;
  let bitmap: ImageBitmap | undefined;
  let video: HTMLVideoElement | undefined;
  let url: string | undefined;
  try {
    let width: number, height: number;
    if (file.type.startsWith("video/")) {
      video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      url = URL.createObjectURL(file);
      const element = video;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Preview timed out."));
        }, 8000);
        const cleanup = () => {
          clearTimeout(timer);
          element.onloadeddata = null;
          element.onerror = null;
        };
        element.onloadeddata = () => {
          cleanup();
          resolve();
        };
        element.onerror = () => {
          cleanup();
          reject(new Error("Unsupported video."));
        };
        element.src = url!;
      });
      width = video.videoWidth;
      height = video.videoHeight;
    } else {
      if (file.size < 120_000) return null;
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
    }
    const scale = Math.min(1, 640 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas
      .getContext("2d")!
      .drawImage((video ?? bitmap)!, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [
      ["image/webp", 0.8],
      ["image/jpeg", 0.8],
    ] as const) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, quality),
      );
      if (blob?.type === type && blob.size < file.size && blob.size <= 700_000)
        return blob;
    }
  } catch {
  } finally {
    bitmap?.close();
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
    if (url) URL.revokeObjectURL(url);
  }
  return null;
}
export type Dropped = File | string;
// Files win over text because copying from a spreadsheet or page puts both on the clipboard.
export function fromTransfer(data: DataTransfer | null): Dropped[] {
  if (!data) return [];
  const files = [...data.files];
  if (files.length) return files;
  const text = data.getData("text/plain");
  return text.trim() ? [text] : [];
}
export async function fromClipboard(): Promise<Dropped[]> {
  if (!navigator.clipboard?.read) throw new Error("unsupported");
  const out: Dropped[] = [];
  for (const item of await navigator.clipboard.read()) {
    const image = item.types.find((type) => type.startsWith("image/"));
    if (image) {
      const blob = await item.getType(image);
      out.push(
        new File([blob], `Pasted image.${image.split("/")[1]}`, {
          type: image,
        }),
      );
    } else if (item.types.includes("text/plain")) {
      const text = await (await item.getType("text/plain")).text();
      if (text.trim()) out.push(text);
    }
  }
  return out;
}
