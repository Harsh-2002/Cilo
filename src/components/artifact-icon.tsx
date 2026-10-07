import { createElement } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Image,
  Sheet,
  Presentation,
  type LucideProps,
} from "lucide-react";
import type { Artifact } from "@/lib/types";
export function artifactIcon(item: Pick<Artifact, "kind" | "mime" | "name">) {
  const mime = item.mime.toLowerCase();
  const extension = item.name.split(".").at(-1)?.toLowerCase() || "";
  if (item.kind === "image" || mime.startsWith("image/")) return Image;
  if (item.kind === "text") return FileText;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (
    /spreadsheet|excel|csv/.test(mime) ||
    ["xls", "xlsx", "ods", "csv", "tsv"].includes(extension)
  )
    return Sheet;
  if (
    /presentation|powerpoint/.test(mime) ||
    ["ppt", "pptx", "odp"].includes(extension)
  )
    return Presentation;
  if (
    /zip|tar|gzip|compressed|7z/.test(mime) ||
    ["zip", "7z", "rar", "tar", "gz"].includes(extension)
  )
    return FileArchive;
  if (
    /javascript|json|xml|html|css/.test(mime) ||
    [
      "js",
      "ts",
      "py",
      "sh",
      "json",
      "xml",
      "html",
      "css",
      "yaml",
      "yml",
    ].includes(extension)
  )
    return FileCode2;
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    /word|document|rtf/.test(mime) ||
    ["pdf", "doc", "docx", "odt", "rtf", "txt", "md"].includes(extension)
  )
    return FileText;
  if (["psd", "ai", "eps"].includes(extension)) return FileImage;
  return File;
}

export function ArtifactIcon({
  item,
  ...props
}: LucideProps & { item: Pick<Artifact, "kind" | "mime" | "name"> }) {
  return createElement(artifactIcon(item), props);
}
