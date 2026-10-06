import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import {
  brandSvg,
  brandArtwork,
  brandFramePath,
  brandPath,
} from "../src/lib/brand.mjs";

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icon.svg", brandSvg + "\n");
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
]) {
  await sharp(Buffer.from(brandSvg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${name}.png`);
}
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#fff"/><g transform="translate(96 96) scale(8)">${brandArtwork}</g></svg>`;
await sharp(Buffer.from(maskable))
  .png()
  .toFile("public/icons/maskable-512.png");

const { launchImages } = await import("../src/lib/pwa.mjs");
mkdirSync("public/icons/launch", { recursive: true });
const stampPath = "public/icons/launch/stamps.json";
const stamps = existsSync(stampPath)
  ? JSON.parse(readFileSync(stampPath, "utf8"))
  : {};
for (const { width, height, scale, theme, url } of launchImages) {
  const background = theme === "dark" ? "#111111" : "#ffffff";
  const foreground = theme === "dark" ? "#ffffff" : "#111111";
  const size = 64 * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><g transform="translate(${(width - size) / 2} ${(height - size) / 2}) scale(${size / 40})"><path d="${brandFramePath}" fill="${foreground}"/><path d="${brandPath}" fill="${background}"/></g></svg>`;
  const target = `public${url.split("?")[0]}`;
  const stamp = createHash("sha256").update(svg).digest("hex");
  if (stamps[target] === stamp && existsSync(target)) continue;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(target);
  stamps[target] = stamp;
}

writeFileSync(stampPath, JSON.stringify(stamps));
