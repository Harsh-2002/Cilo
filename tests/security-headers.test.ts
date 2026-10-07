import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { publicPagePolicy } from "../src/lib/security-policy";

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
  for (const csp of [policy, publicPagePolicy(nonce!)]) {
    assert.ok(!csp.includes("unsafe-inline"));
    assert.ok(!csp.includes("https:"));
    assert.ok(!csp.includes("http:"));
    assert.ok(csp.includes(`style-src 'self' 'nonce-${nonce}'`));
    assert.ok(csp.includes("style-src-attr 'none'"));
  }
  assert.equal(
    first.headers.get("x-middleware-request-content-security-policy"),
    policy,
  );
});

test("offline PWA uses a matching style hash and native reconnection form", async () => {
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { default: config } = await import("../next.config");
  const entries = await config.headers!();
  const headers = entries.find((entry) => entry.source === "/:path*")!.headers;
  assert.equal(
    headers.find((header) => header.key === "Cross-Origin-Embedder-Policy")!
      .value,
    "require-corp",
  );
  const offline = readFileSync("public/offline.html", "utf8");
  const css = offline.match(/<style>([\s\S]*?)<\/style>/)![1];
  const hash = createHash("sha256").update(css).digest("base64");
  const policy = entries
    .find((entry) => entry.source === "/offline.html")!
    .headers.find((header) => header.key === "Content-Security-Policy")!.value;
  assert.ok(policy.includes(`'sha256-${hash}'`));
  assert.ok(!policy.includes("unsafe-inline"));
  assert.ok(!offline.includes("onclick"));
  assert.ok(offline.includes('<form action="/" method="get">'));
});

test("client styles retain the document nonce across server-component refreshes", async () => {
  const { documentNonce } = await import("../src/lib/csp");
  assert.equal(documentNonce("server-only"), "server-only");
  const state = globalThis as typeof globalThis & { __nivraCspNonce?: string };
  const meta = { content: "original-document" };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousNonce = state.__nivraCspNonce;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { querySelector: () => meta },
  });
  delete state.__nivraCspNonce;
  try {
    assert.equal(documentNonce("original-document"), "original-document");
    meta.content = "refresh-response";
    assert.equal(documentNonce("refresh-response"), "original-document");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousNonce) state.__nivraCspNonce = previousNonce;
    else delete state.__nivraCspNonce;
  }
});
