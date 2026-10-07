import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("page CSP replaces supplied nonces and gives every response a fresh nonce", () => {
  const request = new NextRequest("https://notes.example.com/notes", {
    headers: {
      "x-nivra-nonce": "attacker",
      "Content-Security-Policy": "default-src *",
    },
  });
  const first = proxy(request),
    second = proxy(request);
  const policy = first.headers.get("Content-Security-Policy")!;
  const nonce = first.headers.get("x-middleware-request-x-nivra-nonce");
  assert.ok(nonce);
  assert.notEqual(nonce, "attacker");
  assert.notEqual(
    nonce,
    second.headers.get("x-middleware-request-x-nivra-nonce"),
  );
  assert.ok(policy.includes(`'nonce-${nonce}'`));
  assert.ok(policy.includes("object-src 'none'"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(!policy.includes("script-src 'unsafe-inline'"));
  assert.equal(
    first.headers.get("x-middleware-request-content-security-policy"),
    policy,
  );
});
