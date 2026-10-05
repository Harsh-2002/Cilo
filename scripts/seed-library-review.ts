import path from "node:path";
import { realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

async function main() {
  const root = realpathSync(process.argv[2]);
  if (!root.startsWith(path.join(tmpdir(), "cilo-capture-review-")))
    throw new Error("Disposable review directory required.");
  process.env.CILO_DATA_DIR = path.join(root, "review-data");
  const { sqlite } = await import("../src/lib/server/db");
  const { createNote } = await import("../src/lib/server/notes");
  const database = sqlite();
  try {
    const owner = database.prepare("SELECT id,name FROM user").get() as {
      id: string;
      name: string;
    };
    if (owner?.name !== "Capture Review Owner")
      throw new Error("Disposable review owner required.");
    if (
      (
        database.prepare("SELECT count(*) AS n FROM notes").get() as {
          n: number;
        }
      ).n > 10
    )
      throw new Error("Review library already seeded.");
    const note = database.prepare(
      "INSERT INTO notes(id,owner_id,title,document,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    );
    const task = database.prepare(
      "INSERT INTO tasks(id,owner_id,title,note_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    );
    const bookmark = database.prepare(
      "INSERT INTO bookmarks(id,owner_id,url,title,description,note_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    );
    database.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        const id = randomUUID();
        const text = `${"Steady work and useful ideas belong in a quiet library. ".repeat(30)} Nebula reference ${randomUUID()}`;
        const document = {
          schemaVersion: 1,
          blocks: [
            {
              id: randomUUID(),
              type: "paragraph",
              content: [{ type: "text", text, styles: {} }],
            },
          ],
        };
        note.run(
          id,
          owner.id,
          `Research note ${String(i).padStart(5, "0")}`,
          JSON.stringify(document),
          text,
          i,
          i,
        );
        if (i < 5000) {
          task.run(
            randomUUID(),
            owner.id,
            `Review nebula task ${i} ${randomUUID()}`,
            id,
            i,
            i,
          );
          bookmark.run(
            randomUUID(),
            owner.id,
            `https://example.invalid/${i}`,
            `Nebula reference ${i}`,
            `Useful resource ${randomUUID()}`,
            id,
            i,
            i,
          );
        }
      }
    })();
    const block = randomUUID();
    const paragraphs = Array.from({ length: 24 }, (_, i) => ({
      id: randomUUID(),
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `Introductory paragraph ${i}. ${"This is ordinary content before the relevant passage. ".repeat(4)}`,
          styles: {},
        },
      ],
    }));
    const target = createNote(owner.id, "Buried context fixture", {
      schemaVersion: 1,
      blocks: [
        ...paragraphs,
        {
          id: block,
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The aurora milestone is recorded near the end of this note.",
              styles: {},
            },
          ],
        },
      ],
    });
    const other = createNote(owner.id, "Keyboard target", {
      schemaVersion: 1,
      blocks: [
        {
          id: randomUUID(),
          type: "paragraph",
          content: [
            { type: "text", text: "A safe place to keep a draft.", styles: {} },
          ],
        },
      ],
    });
    writeFileSync(
      path.join(root, "fixtures.json"),
      JSON.stringify({ noteId: target.id, blockId: block, otherId: other.id }),
    );
    console.log(JSON.stringify({ notes: 10002, tasks: 5000, bookmarks: 5000 }));
  } finally {
    database.close();
  }
}
void main();
