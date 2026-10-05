import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runInNewContext } from "node:vm";
import { NoteContent } from "../src/components/note-content";
import { readingBlocks, readerUrl } from "../src/lib/reader";
import { themeBootstrap } from "../src/lib/theme";

const text = (value: string, styles = {}) => [
  { type: "text", text: value, styles },
];
test("the public reader sends rich text, tables, lists, code and drawings as HTML without the editor", () => {
  const html = renderToStaticMarkup(
    createElement(NoteContent, {
      blocks: [
        {
          type: "paragraph",
          content: text("Visible without JavaScript", { bold: true }),
        },
        { type: "heading", props: { level: 2 }, content: text("Details") },
        {
          type: "bulletListItem",
          content: text("First"),
          children: [{ type: "numberedListItem", content: text("Nested") }],
        },
        { type: "bulletListItem", content: text("Second") },
        {
          type: "table",
          content: {
            type: "tableContent",
            headerRows: 1,
            rows: [
              { cells: [text("Name"), text("Value")] },
              { cells: [text("Example"), text("42")] },
            ],
          },
        },
        {
          type: "codeBlock",
          props: { language: "javascript" },
          content: text("const count = 42;"),
        },
        {
          type: "canvas",
          props: {
            preview:
              "/api/cilo/published/" +
              "a".repeat(48) +
              "/files/" +
              "b".repeat(36),
          },
        },
        {
          type: "checkListItem",
          props: { checked: true },
          content: text("Done"),
        },
      ],
    }),
  );
  assert.match(html, /<strong>Visible without JavaScript<\/strong>/);
  assert.match(html, /<h2>.*Details/);
  assert.match(html, /<ul>.*<ol>/);
  assert.match(html, /<th>.*Name/);
  assert.match(html, /<td>.*42/);
  assert.match(html, /<code data-language="javascript">const count = 42;/);
  assert.match(html, /alt="Drawing"/);
  assert.match(html, /aria-label="Completed"/);
  assert.doesNotMatch(html, /contenteditable|bn-editor|Loading note/);
});
test("public reader escapes imported content and rejects executable or private URLs", () => {
  const html = renderToStaticMarkup(
    createElement(NoteContent, {
      blocks: [
        {
          type: "paragraph",
          content: [
            ...text('<script>alert("xss")</script>'),
            {
              type: "link",
              href: "javascript:alert(1)",
              content: text("Unsafe link"),
            },
          ],
        },
        {
          type: "image",
          props: {
            url: "data:image/svg+xml,<svg onload=alert(1)>",
            name: "Unsafe image",
          },
        },
        {
          type: "paragraph",
          content: [
            {
              type: "link",
              href: "https://example.org/reference",
              content: text("Safe link"),
            },
          ],
        },
      ],
    }),
  );
  assert.doesNotMatch(html, /<script|javascript:|data:image/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
  assert.equal(readerUrl("/?note=private"), undefined);
  assert.equal(readerUrl("/api/cilo/settings"), undefined);
  assert.equal(
    readerUrl("https://example.org/a\njavascript:alert(1)"),
    undefined,
  );
});
test("only a duplicate leading title heading is removed from reading content", () => {
  const heading = {
    type: "heading",
    props: { level: 1 },
    content: text("Title"),
  };
  const body = { type: "paragraph", content: text("Body") };
  assert.deepEqual(
    readingBlocks("Title", { schemaVersion: 1, blocks: [heading, body] }),
    [body],
  );
  assert.equal(
    readingBlocks("Different", { schemaVersion: 1, blocks: [heading, body] })
      .length,
    2,
  );
  assert.equal(
    readingBlocks("Title", {
      schemaVersion: 1,
      blocks: [{ ...heading, children: [body] }, body],
    }).length,
    2,
  );
});
test("initial theme survives blocked storage and honors light, dark and system before hydration", () => {
  for (const [saved, systemDark, blocked, expected] of [
    ["light", true, false, "light"],
    ["dark", false, false, "dark"],
    ["system", true, false, "dark"],
    [null, true, true, "dark"],
  ] as const) {
    const classes = new Set<string>();
    const root = {
      classList: {
        remove: (...values: string[]) =>
          values.forEach((v) => classes.delete(v)),
        add: (value: string) => classes.add(value),
      },
      style: { colorScheme: "" },
    };
    runInNewContext(themeBootstrap, {
      document: { documentElement: root },
      window: { matchMedia: () => ({ matches: systemDark }) },
      localStorage: {
        getItem: () => {
          if (blocked) throw Error("Blocked");
          return saved;
        },
      },
    });
    assert.deepEqual([...classes], [expected]);
    assert.equal(root.style.colorScheme, expected);
  }
});

test("reader code highlighting preserves content and both theme palettes", async () => {
  const { highlightReaderCode } = await import("../src/lib/reader-highlighter");
  const source = "const answer = 42;";
  const tokens = await highlightReaderCode(source, "javascript");
  assert.equal(
    tokens
      .map((line) => line.map((token) => token.content).join(""))
      .join("\n"),
    source,
  );
  assert.ok(
    tokens
      .flat()
      .some(
        (token) => token.variants.light.color !== token.variants.dark.color,
      ),
  );
});
