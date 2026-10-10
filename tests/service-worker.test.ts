import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

type Listener = (event: Record<string, unknown>) => void;
function load(online = true) {
  const store = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, Listener>();
  const caches = {
    async open(name: string) {
      const bucket = store.get(name) ?? new Map<string, Response>();
      store.set(name, bucket);
      return {
        async addAll(urls: string[]) {
          for (const url of urls)
            bucket.set(
              new URL(url, "https://nivra.test").href,
              new Response(url),
            );
        },
        async match(request: Request | string) {
          const key =
            typeof request === "string"
              ? new URL(request, "https://nivra.test").href
              : request.url;
          return bucket.get(key)?.clone();
        },
        async put(request: Request, response: Response) {
          bucket.set(request.url, response);
        },
        async keys() {
          return [...bucket.keys()].map((url) => ({ url }));
        },
        async delete(request: { url: string }) {
          return bucket.delete(request.url);
        },
      };
    },
    async match(url: string) {
      for (const bucket of store.values()) {
        const hit = bucket.get(new URL(url, "https://nivra.test").href);
        if (hit) return hit.clone();
      }
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name: string) {
      return store.delete(name);
    },
  };
  const fetched: string[] = [];
  const context = {
    self: {
      location: new URL("https://nivra.test/sw.js"),
      addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
    caches,
    URL,
    Promise,
    fetch: async (request: Request) => {
      fetched.push(request.url);
      if (!online) throw new Error("offline");
      return new Response("network", { status: 200 });
    },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), context);
  const dispatch = async (
    url: string,
    init: { method?: string; mode?: string } = {},
  ) => {
    const request = Object.assign(
      new Request(url, { method: init.method || "GET" }),
      {},
    );
    Object.defineProperty(request, "mode", { value: init.mode || "no-cors" });
    let responded: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request,
      respondWith: (value: Promise<Response>) => (responded = value),
    });
    return responded ? await responded : undefined;
  };
  return { store, listeners, dispatch, fetched };
}

test("service worker only caches public static assets and falls back offline for navigations", async () => {
  const worker = load(false);
  let installed: Promise<unknown> | undefined;
  worker.listeners.get("install")!({
    waitUntil: (value: Promise<unknown>) => (installed = value),
  });
  await installed;
  assert.deepEqual(
    [...worker.store.get("nivra-static-v5")!.keys()].map(
      (url) => new URL(url).pathname,
    ),
    [
      "/offline.html",
      "/icon.svg",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
    ],
  );
  for (const [url, init] of [
    ["https://nivra.test/api/v1/notes", {}],
    ["https://nivra.test/api/v1/files/abc", {}],
    ["https://nivra.test/api/v1/published/token/files/abc", {}],
    ["https://elsewhere.test/_next/static/a.js", {}],
    ["https://nivra.test/_next/static/a.js", { method: "POST" }],
    ["https://nivra.test/share/token", {}],
  ] as const)
    assert.equal(await worker.dispatch(url, init), undefined, url);
  const offline = await worker.dispatch("https://nivra.test/", {
    mode: "navigate",
  });
  assert.equal(await offline!.text(), "/offline.html");
  const shared = await worker.dispatch("https://nivra.test/share/token", {
    mode: "navigate",
  });
  assert.equal(await shared!.text(), "/offline.html");
  assert.ok(
    ![...worker.store.get("nivra-static-v5")!.keys()].some((url) =>
      /\/(api|share)\//.test(url),
    ),
  );
});

test("online navigations are never stored and static files are cached once with a size limit", async () => {
  const worker = load(true);
  worker.listeners.get("install")!({ waitUntil: () => {} });
  const page = await worker.dispatch("https://nivra.test/", {
    mode: "navigate",
  });
  assert.equal(await page!.text(), "network");
  assert.ok(
    ![...(worker.store.get("nivra-static-v5") ?? new Map()).keys()].some(
      (value) => {
        const url = new URL(value);
        return url.origin === "https://nivra.test" && url.pathname === "/";
      },
    ),
  );
  for (let i = 0; i < 160; i++)
    await worker.dispatch(
      `https://nivra.test/_next/static/chunks/${String(i).padStart(3, "0")}.js`,
    );
  const kept = [...worker.store.get("nivra-static-v5")!.keys()].map(
    (url) => new URL(url).pathname,
  );
  assert.ok(kept.length <= 124, `kept ${kept.length}`);
  assert.ok(
    kept.includes("/offline.html") && kept.includes("/icons/icon-192.png"),
  );
  assert.ok(kept.includes("/_next/static/chunks/159.js"));
  assert.ok(!kept.includes("/_next/static/chunks/000.js"));
  const before = worker.fetched.length;
  await worker.dispatch("https://nivra.test/_next/static/chunks/159.js");
  assert.equal(
    worker.fetched.length,
    before,
    "cached static file should not hit the network",
  );
});
