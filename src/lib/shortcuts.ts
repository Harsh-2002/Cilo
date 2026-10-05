import { useSyncExternalStore } from "react";
export type Chord = {
  key: string;
  code: string;
  alt?: boolean;
  shift?: boolean;
};
// One definition drives both the key handler and the label shown to people.
export const shortcuts = {
  search: { key: "K", code: "KeyK" },
  newNote: { key: "N", code: "KeyN", alt: true },
  capture: { key: "Enter", code: "Enter", shift: true },
} satisfies Record<string, Chord>;
const none = () => () => {};
const apple = () =>
  /Mac|iPhone|iPad|iPod/.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent,
  );
export const useIsApple = () => useSyncExternalStore(none, apple, () => false);
export function matches(event: KeyboardEvent, chord: Chord) {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.code === chord.code &&
    event.altKey === !!chord.alt &&
    event.shiftKey === !!chord.shift
  );
}
export function shortcutParts(chord: Chord, isApple: boolean) {
  const named = chord.key === "Enter" ? (isApple ? "↵" : "Enter") : chord.key;
  return [
    isApple ? "⌘" : "Ctrl",
    ...(chord.alt ? [isApple ? "⌥" : "Alt"] : []),
    ...(chord.shift ? [isApple ? "⇧" : "Shift"] : []),
    named,
  ];
}
