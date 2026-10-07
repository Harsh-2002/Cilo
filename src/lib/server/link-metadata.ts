import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { HttpError } from "./http";

const blocked = new BlockList();
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blockedV6.addSubnet(address, prefix, "ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return (
    family !== 0 &&
    !(family === 4
      ? blocked.check(address, "ipv4")
      : blockedV6.check(address, "ipv6")) &&
    (family === 4 ||
      address.toLowerCase().startsWith("2") ||
      address.toLowerCase().startsWith("3"))
  );
}
export function bookmarkUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Enter a complete HTTP or HTTPS URL.");
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    value.length > 4096
  )
    throw new HttpError(400, "Enter an HTTP or HTTPS URL without credentials.");
  return url.href;
}
export type RemotePage = { bytes: Buffer; type: string; url: string };
export async function fetchPublic(
  urlValue: string,
  limit: number,
  signal: AbortSignal,
  redirects = 0,
  accept = "text/html,image/*",
): Promise<RemotePage> {
  const url = new URL(bookmarkUrl(urlValue));
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new Error("Unsupported remote port.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  const addresses = await new Promise<import("node:dns").LookupAddress[]>(
    (resolve, reject) => {
      const aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
      void lookup(hostname, { all: true, verbatim: true })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", aborted));
    },
  );
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Private network URLs cannot be fetched.");
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).get(
      url,
      {
        signal,
        headers: {
          "User-Agent": "Nivra-LinkPreview/1.0",
          Accept: accept,
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, options, callback) =>
          options.all
            ? callback(null, [pinned])
            : callback(null, pinned.address, pinned.family),
      },
      (response) => {
        const status = response.statusCode || 0;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          response.headers.location
        ) {
          response.resume();
          if (redirects >= 3) {
            reject(new Error("Too many redirects."));
            return;
          }
          let next: string;
          try {
            next = new URL(response.headers.location, url).href;
          } catch {
            reject(new Error("Invalid redirect."));
            return;
          }
          fetchPublic(next, limit, signal, redirects + 1, accept).then(
            resolve,
            reject,
          );
          return;
        }
        if (
          status < 200 ||
          status >= 300 ||
          Number(response.headers["content-length"]) > limit ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity")
        ) {
          response.destroy();
          reject(new Error("This page could not be fetched."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            response.destroy();
            reject(new Error("Remote response is too large."));
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            type: String(response.headers["content-type"] || "")
              .split(";")[0]
              .toLowerCase(),
            url: url.href,
          }),
        );
      },
    );
    request.on("error", reject);
  });
}
function text(value: string, limit: number) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
      (_, entity: string) => {
        if (entity[0] === "#") {
          const code =
            entity[1].toLowerCase() === "x"
              ? parseInt(entity.slice(2), 16)
              : parseInt(entity.slice(1), 10);
          return code > 0 &&
            code <= 0x10ffff &&
            !(code >= 0xd800 && code <= 0xdfff)
            ? String.fromCodePoint(code)
            : "";
        }
        return (
          (
            {
              amp: "&",
              quot: '"',
              apos: "'",
              lt: "<",
              gt: ">",
              nbsp: " ",
            } as Record<string, string>
          )[entity.toLowerCase()] || ""
        );
      },
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
export function parseMetadata(html: string, url: string) {
  const metadata = new Map<string, string>();
  const clean = html.replace(
    /<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi,
    "",
  );
  let icon = "";
  for (const match of clean.matchAll(
    /<(meta|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi,
  )) {
    const attributes: Record<string, string> = {};
    for (const a of match[2].matchAll(
      /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    ))
      attributes[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4];
    if (match[1].toLowerCase() === "meta") {
      const key = (attributes.property || attributes.name || "").toLowerCase();
      if (!metadata.has(key) && attributes.content)
        metadata.set(key, attributes.content);
    } else if (
      /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(attributes.rel || "") &&
      attributes.href &&
      !icon
    )
      icon = attributes.href;
  }
  const resolve = (value: string) => {
    if (!value) return "";
    try {
      return bookmarkUrl(new URL(text(value, 4096), url).href);
    } catch {
      return "";
    }
  };
  return {
    title: text(
      metadata.get("og:title") ||
        metadata.get("twitter:title") ||
        clean.match(/<title\b[^>]*>([^]*?)<\/title\s*>/i)?.[1] ||
        new URL(url).hostname,
      300,
    ),
    description: text(
      metadata.get("og:description") ||
        metadata.get("description") ||
        metadata.get("twitter:description") ||
        "",
      2000,
    ),
    siteName: text(metadata.get("og:site_name") || new URL(url).hostname, 100),
    thumbnail: resolve(
      metadata.get("og:image") || metadata.get("twitter:image") || "",
    ),
    icon: resolve(icon || "/favicon.ico"),
  };
}
export function imageMime(bytes: Buffer): string | null {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()))
    return "image/gif";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])))
    return "image/x-icon";
  return null;
}
