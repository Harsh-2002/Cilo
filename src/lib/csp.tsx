"use client";
import { createContext, useContext } from "react";

export const CspNonce = createContext<string | undefined>(undefined);
export function documentNonce(value?: string) {
  if (typeof document === "undefined") return value;
  const state = globalThis as typeof globalThis & { __nivraCspNonce?: string };
  return (state.__nivraCspNonce ||=
    document.querySelector<HTMLMetaElement>('meta[name="nivra-nonce"]')
      ?.content || value);
}
export function useCspNonce() {
  return documentNonce(useContext(CspNonce));
}
