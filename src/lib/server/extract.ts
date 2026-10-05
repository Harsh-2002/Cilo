import { strFromU8, unzipSync } from "fflate";
export const maxTextLength = 200_000;
export type ImageInfo = {
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  width: number;
  height: number;
};
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));
// Dimensions come from the file header so the grid can reserve space and oversized images are not decoded.
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG")
    return {
      mime: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  if (bytes.length > 10 && ascii(bytes, 0, 4) === "GIF8")
    return {
      mime: "image/gif",
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  if (
    bytes.length > 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    const chunk = ascii(bytes, 12, 16);
    if (chunk === "VP8X")
      return {
        mime: "image/webp",
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    if (chunk === "VP8 ")
      return {
        mime: "image/webp",
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return {
        mime: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    return null;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      )
        return {
          mime: "image/jpeg",
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      if (
        marker === 0xd8 ||
        (marker >= 0xd0 && marker <= 0xd7) ||
        marker === 0x01
      )
        offset += 2;
      else offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  }
  return null;
}
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decode = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1].toLowerCase() === "x"
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return entities[name.toLowerCase()] ?? match;
  });
const textExtensions =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|log|xml|html?|svg|ya?ml|toml|ini|cfg|conf|env|sh|bash|zsh|py|js|mjs|cjs|ts|tsx|jsx|css|scss|sql|go|rs|java|kt|c|h|cpp|hpp|rb|php|swift|tex|rtf|srt|vtt|diff|patch)$/i;
function plainText(bytes: Uint8Array) {
  if (bytes.subarray(0, 8192).includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, 4 * 1024 * 1024),
    );
  } catch {
    return null;
  }
}
const officeParts: [RegExp, RegExp][] = [
  [
    /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/,
    /<w:t[^>]*>([^<]*)<\/w:t>|<\/w:p>/g,
  ],
  [
    /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/,
    /<a:t[^>]*>([^<]*)<\/a:t>|<\/a:p>/g,
  ],
  [/^xl\/sharedStrings\.xml$/, /<t[^>]*>([^<]*)<\/t>|<\/si>/g],
];
function officeText(bytes: Uint8Array) {
  let budget = 40 * 1024 * 1024;
  const entries = unzipSync(bytes, {
    filter: (file) => {
      budget -= file.originalSize;
      return (
        budget > 0 &&
        file.originalSize < 20 * 1024 * 1024 &&
        officeParts.some(([name]) => name.test(file.name))
      );
    },
  });
  const parts: string[] = [];
  for (const name of Object.keys(entries).sort()) {
    const pattern = officeParts.find(([match]) => match.test(name))?.[1];
    if (!pattern) continue;
    const xml = strFromU8(entries[name]);
    let line = "";
    for (const match of xml.matchAll(new RegExp(pattern))) {
      if (match[1] !== undefined) line += decode(match[1]);
      else {
        if (line.trim()) parts.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) parts.push(line.trim());
  }
  return parts.join("\n");
}
const markup = (text: string) =>
  decode(
    text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(title|desc|text|p|div|br|li|h[1-6]|tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
function rtfText(source: string) {
  return source
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(
      /\{\\(fonttbl|colortbl|stylesheet|info|pict)[^{}]*(\{[^{}]*\}[^{}]*)*\}/g,
      "",
    )
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\(par|line|row)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\u(-?\d+)\??/g, (_, code: string) =>
      String.fromCodePoint((Number(code) + 65536) % 65536),
    )
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\\(.)/g, "$1");
}
function odfText(bytes: Uint8Array) {
  const entries = unzipSync(bytes, {
    filter: (file) =>
      file.name === "content.xml" && file.originalSize < 40 * 1024 * 1024,
  });
  const xml = entries["content.xml"];
  return xml
    ? markup(
        strFromU8(xml)
          .replace(
            /<\/text:(p|h)>|<text:line-break\/>|<\/table:table-row>/g,
            "\n",
          )
          .replace(/<text:tab\/>|<\/table:table-cell>/g, " "),
      )
    : "";
}
// A zip is searchable by the names of what is inside it.
function archiveListing(bytes: Uint8Array) {
  const names: string[] = [];
  unzipSync(bytes, {
    filter: (file) => {
      if (names.length < 5000) names.push(file.name);
      return false;
    },
  });
  return names.join("\n");
}
export const isPdf = (bytes: Uint8Array) =>
  bytes.length > 8 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
const pdfLimits = { bytes: 40 * 1024 * 1024, pages: 400 };
// PDF text is read in the background because parsing a large document takes a while.
export async function pdfText(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length > pdfLimits.bytes) return null;
  const { extractText: read, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (document.numPages > pdfLimits.pages) return null;
    const { text } = await read(document, { mergePages: true });
    const clean = text
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return clean.slice(0, maxTextLength);
  } finally {
    await document.loadingTask.destroy();
  }
}
// Returns searchable text for a file, or null when its type has no readable text.
export function extractText(
  name: string,
  mime: string,
  bytes: Uint8Array,
): string | null {
  const lower = name.toLowerCase();
  let text: string | null = null;
  try {
    if (/\.(docx|pptx|xlsx)$/.test(lower) || /officedocument/.test(mime))
      text = officeText(bytes);
    else if (/\.(odt|ods|odp)$/.test(lower) || /opendocument/.test(mime))
      text = odfText(bytes);
    else if (/\.(zip|jar)$/.test(lower) || mime === "application/zip")
      text = archiveListing(bytes);
    else if (
      /^text\//.test(mime) ||
      /json|xml|yaml|javascript|svg|rtf/.test(mime) ||
      textExtensions.test(lower) ||
      /\.svg$/.test(lower) ||
      bytes.length <= 1024 * 1024
    ) {
      text = plainText(bytes);
      if (
        text !== null &&
        (/\.(html?|svg)$/.test(lower) || /html|svg/.test(mime))
      )
        text = markup(text);
      else if (
        text !== null &&
        (/\.rtf$/.test(lower) || /rtf/.test(mime) || text.startsWith("{\\rtf"))
      )
        text = rtfText(text);
    }
  } catch {
    return null;
  }
  if (text === null) return null;
  text = text.replace(/\r\n?/g, "\n").trim();
  return text ? text.slice(0, maxTextLength) : null;
}
