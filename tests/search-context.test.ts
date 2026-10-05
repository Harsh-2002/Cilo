import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMatches, findSearchBlock } from "../src/lib/search-context";
import { SearchText } from "../src/components/search-text";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

test("match ranges preserve Unicode and render untrusted text safely", () => {
  const value = decodeMatches(
    "📝 A <start>résumé<end> and <script>alert(1)</script>",
    "<start>",
    "<end>",
  );
  assert.equal(value.text, "📝 A résumé and <script>alert(1)</script>");
  assert.equal(value.text.slice(...value.ranges[0]), "résumé");
  const html = renderToStaticMarkup(
    createElement(SearchText, { text: value.text, ranges: value.ranges }),
  );
  assert.ok(html.includes("<mark>résumé</mark>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.equal(
    decodeMatches("ordinary [brackets]", "<start>", "<end>").text,
    "ordinary [brackets]",
  );
});
test("search targets nested content rather than its containing parent", () => {
  assert.equal(
    findSearchBlock(
      [
        {
          id: "parent",
          type: "heading",
          content: [{ text: "Introduction" }],
          children: [
            {
              id: "child",
              type: "paragraph",
              content: [{ text: "Résumé planning and milestones" }],
            },
          ],
        },
        { id: "other", type: "paragraph", content: [{ text: "Planning" }] },
      ],
      ["resume", "milestones"],
    ),
    "child",
  );
  assert.equal(
    findSearchBlock(
      [{ id: "code", type: "codeBlock", content: "const milestone = 1" }],
      ["milestone"],
    ),
    "code",
  );
  assert.equal(
    findSearchBlock(
      [{ id: "empty", type: "paragraph", content: [] }],
      ["missing"],
    ),
    undefined,
  );
});
