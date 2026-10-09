import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

test("notification checks avoid native push access without permission and verify granted subscriptions", async () => {
  const saved = new Map(
    ["window", "navigator", "Notification", "fetch"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  let permission = "default",
    nativeChecks = 0,
    requests = 0,
    registered = true;
  const endpoint = "https://push.example.test/subscription";
  const notifications = {
    get permission() {
      return permission;
    },
  };
  const define = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, { configurable: true, value });
  define("window", {
    isSecureContext: true,
    PushManager: {},
    Notification: notifications,
  });
  define("Notification", notifications);
  define("navigator", {
    serviceWorker: {
      async getRegistration() {
        nativeChecks++;
        return {
          pushManager: {
            async getSubscription() {
              nativeChecks++;
              return { endpoint };
            },
          },
        };
      },
    },
  });
  define("fetch", async (url: string) => {
    requests++;
    assert.equal(url, "/api/v1/calendar/subscriptions");
    return Response.json({
      hashes: registered
        ? [{ hash: createHash("sha256").update(endpoint).digest("hex") }]
        : [],
    });
  });
  try {
    const { deviceNotificationsEnabled } =
      await import("../src/lib/push-notifications");
    for (const value of ["default", "denied"]) {
      permission = value;
      assert.equal(await deviceNotificationsEnabled(), false);
    }
    assert.equal(nativeChecks, 0);
    assert.equal(requests, 0);
    permission = "granted";
    assert.equal(await deviceNotificationsEnabled(), true);
    registered = false;
    assert.equal(await deviceNotificationsEnabled(), false);
    assert.equal(nativeChecks, 4);
    assert.equal(requests, 2);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
