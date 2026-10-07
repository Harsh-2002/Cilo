"use client";
import { useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";

export const passkeyAuth = createAuthClient({ plugins: [passkeyClient()] });
export function passkeyAvailable() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined"
  );
}
export function passkeyCancelled(error: { code?: string; message?: string }) {
  return (
    error.code === "ERROR_CEREMONY_ABORTED" ||
    /cancel|notallowederror|timed out|not allowed/i.test(error.message || "")
  );
}

const subscribe = () => () => {};
export function usePasskeySupported() {
  return useSyncExternalStore(subscribe, passkeyAvailable, () => false);
}
