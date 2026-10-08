const CACHE = "nivra-static-v5";
const LIMIT = 120;
const DEVELOPMENT =
  new URL(self.location.href).searchParams.get("development") === "1";
// Every build adds new hashed assets, so evict the oldest build files to keep the cache bounded.
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT)))
    if (new URL(key.url).pathname.startsWith("/_next/static/"))
      await cache.delete(key);
}
self.addEventListener("install", (event) => {
  if (DEVELOPMENT) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/offline.html",
          "/icon.svg",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(
                  String.fromCharCode(99, 105, 108, 111) + "-static-",
                ) ||
                  key.startsWith("nivra-static-")) &&
                key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (DEVELOPMENT) return;
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg"
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const result = await fetch(event.request);
        if (result.ok) {
          await cache.put(event.request, result.clone());
          await trim(cache);
        }
        return result;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data.json();
      } catch {
        return;
      }
      if (
        !payload ||
        typeof payload.id !== "string" ||
        payload.id.length > 128 ||
        typeof payload.title !== "string" ||
        !Number.isFinite(payload.time) ||
        (payload.path !== undefined && typeof payload.path !== "string")
      )
        return;
      const url = new URL(payload.path || "/calendar", self.location.origin);
      if (url.origin !== self.location.origin || url.pathname !== "/calendar")
        return;
      await self.registration.showNotification(payload.title.slice(0, 300), {
        body: new Date(payload.time).toLocaleString(),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.id,
        data: { path: url.pathname + url.search },
      });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(
        event.notification.data?.path || "/calendar",
        self.location.origin,
      );
      if (url.origin !== self.location.origin || url.pathname !== "/calendar")
        return;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin === url.origin) {
          await client.navigate(url.href);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
