"use client";
import {
  useEffect,
  useSyncExternalStore,
  type RefObject,
  type KeyboardEvent,
} from "react";

const desktopQuery = "(min-width: 1024px) and (pointer: fine)";
const desktopKeyboard = () => matchMedia(desktopQuery).matches;
function subscribe(callback: () => void) {
  const media = matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function useDesktopKeyboard() {
  return useSyncExternalStore(subscribe, desktopKeyboard, () => false);
}

export function useCreationFocus(
  input: RefObject<HTMLInputElement | null>,
  enabled = true,
  requested = false,
) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      const field = input.current;
      if (!field || field.disabled) return;
      const active = document.activeElement;
      if (
        requested ||
        (desktopKeyboard() &&
          !document.querySelector('[role="dialog"][data-state="open"]') &&
          (active === document.body ||
            active?.closest(".desktop-navigation, .tasks-view-toolbar")))
      )
        field.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [input, enabled, requested]);
}

export function guardComposition(event: KeyboardEvent) {
  const composing = event.nativeEvent.isComposing || event.keyCode === 229;
  if (event.key === "Enter" && composing) event.preventDefault();
  return composing;
}

export function returnToCreation(input: HTMLInputElement | null) {
  const active = document.activeElement;
  if (
    input &&
    (active === input ||
      active === document.body ||
      (active instanceof HTMLButtonElement && input.form?.contains(active)))
  )
    input.focus({ preventScroll: true });
}
