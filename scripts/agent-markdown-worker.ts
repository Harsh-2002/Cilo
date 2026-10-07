import { parentPort } from "node:worker_threads";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
const editor = ServerBlockNoteEditor.create();
parentPort!.on("message", async ({ markdown }) => {
  try {
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    parentPort!.postMessage({ blocks });
  } catch {
    parentPort!.postMessage({ error: "This Markdown could not be converted." });
  }
});
