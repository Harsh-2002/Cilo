import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { brandSvg, brandArtwork } from "../src/lib/brand.mjs";

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
