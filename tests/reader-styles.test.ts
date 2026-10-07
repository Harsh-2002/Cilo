import { test } from "node:test";
import assert from "node:assert/strict";
import { readerStyle, readerStyles } from "../src/lib/reader-styles";

test("reader styles preserve colors and alignment without admitting imported CSS", () => {
  const item = {
    textColor: "red",
    backgroundColor: "#AbC",
    textAlignment: "center",
  };
  const style = readerStyle(item);
  assert.ok(style.rule.includes("color:#c43c3c"));
  assert.ok(style.rule.includes("background-color:#abc"));
  assert.ok(style.rule.includes("text-align:center"));
  assert.equal(readerStyles([{ props: item }, { styles: item }]), style.rule);
  for (const textColor of ["__proto__", "constructor", "#abcde", "#abcdefg"])
    assert.equal(readerStyle({ textColor }).rule, "");
  assert.equal(
    readerStyle({
      textColor: "red; background:url(https://evil.example)",
      backgroundColor: "</style><script>bad</script>",
      textAlignment: "center;position:fixed",
    }).rule,
    "",
  );
});
