"use client";
import { api } from "./client";

export const notificationPromptKey = "nivra-notification-prompt";
export const notificationUpdate = "nivra:notifications-updated";

export function canUseDeviceNotifications() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function rememberNotificationChoice(choice: "enabled" | "dismissed") {
  try {
    localStorage.setItem(notificationPromptKey, choice);
  } catch {}
  window.dispatchEvent(new Event(notificationUpdate));
}

export async function deviceNotificationsEnabled() {
  if (!canUseDeviceNotifications() || Notification.permission !== "granted")
    return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(subscription.endpoint),
      ),
    ),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const state = await api<{ hashes: { hash: string }[] }>(
    "calendar/subscriptions",
  );
  return state.hashes.some((value) => value.hash === hash);
}

export async function enableDeviceNotifications() {
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted")
    throw Error(
      permission === "denied"
        ? "Notifications are blocked. Allow them in your browser’s site settings, then try again."
        : "Notification permission was not granted.",
    );
  await navigator.serviceWorker.register(
    process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?development=1",
  );
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>(
    "calendar/subscriptions",
  );
  const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  try {
    await api("calendar/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
  rememberNotificationChoice("enabled");
}

export async function disableDeviceNotifications() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api("calendar/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  rememberNotificationChoice("dismissed");
}

export function notificationError(error: unknown) {
  const value = error as { name?: string; message?: string } | null;
  const message =
    value?.message ?? "Notifications could not be enabled. Try again.";
  return value?.name === "AbortError" || /push service/i.test(message)
    ? "Your browser could not connect to its notification service. Check its push settings or try another browser."
    : message;
}
