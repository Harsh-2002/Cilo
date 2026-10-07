export function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
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
