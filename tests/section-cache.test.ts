import assert from "node:assert/strict";
import test from "node:test";
import { sectionCache } from "../src/lib/section-cache";

test("repeated queries retain the active collection while discarding old result lists", () => {
  sectionCache.clear();
  const current = { items: [{ id: "active-note", title: "Current note" }] };
  sectionCache.set("notes:current", current);
  for (let index = 0; index < 1000; index++) {
    sectionCache.set(`artifacts:query:${index}`, { items: [{ id: index }] });
    assert.equal(sectionCache.get("notes:current"), current);
  }
  let retained = 0;
  for (let index = 0; index < 1000; index++)
    if (sectionCache.get(`artifacts:query:${index}`)) retained++;
  assert.equal(retained, 23);
  assert.equal(sectionCache.get("artifacts:query:0"), undefined);
  sectionCache.clear("notes:");
  assert.equal(sectionCache.get("notes:current"), undefined);
  assert.deepEqual(sectionCache.get("artifacts:query:999"), {
    items: [{ id: 999 }],
  });
  sectionCache.clear();
});
