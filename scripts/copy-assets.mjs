import { cpSync, mkdirSync } from "node:fs";
import "./build-icons.mjs";
mkdirSync("public/excalidraw", { recursive: true });
cpSync(
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  "public/excalidraw/fonts",
  { recursive: true },
);
