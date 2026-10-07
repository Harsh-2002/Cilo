import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPublicationHtml } from "../src/lib/server/publication-html";

test("prepared public HTML escapes metadata and embedded document JSON while keeping rich content readable", async () => {
  const html = await renderPublicationHtml(
    {
      title: '<script>alert("title")</script>',
      publishedAt: 1700000000000,
      document: {
        schemaVersion: 1,
        blocks: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: '</script><script>alert("body")</script>',
                styles: {},
              },
            ],
          },
          {
            type: "codeBlock",
            props: { language: "javascript" },
            content: [{ type: "text", text: "const value = 42;", styles: {} }],
          },
          {
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Readable heading", styles: {} }],
          },
        ],
      },
    },
    '"/><script>alert("meta")</script>',
  );
  assert.match(html, /<title>&lt;script&gt;/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /<h2><span>Readable heading<\/span><\/h2>/);
  assert.match(html, /const value = 42;/);
  assert.doesNotMatch(html, /<script>alert/);
  const embedded = html.match(
    /<script id="publication-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1];
  assert.doesNotMatch(embedded, /<\/script>/);
  assert.equal(
    JSON.parse(embedded).document.blocks[0].content[0].text,
    '</script><script>alert("body")</script>',
  );
  assert.match(html, /src="\/reader\/main.js"/);
  assert.doesNotMatch(html, /contenteditable|bn-editor/);
});
