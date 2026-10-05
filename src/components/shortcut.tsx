"use client";
import { shortcutParts, useIsApple, type Chord } from "@/lib/shortcuts";
export function Shortcut({
  chord,
  className,
}: {
  chord: Chord;
  className?: string;
}) {
  const apple = useIsApple();
  const parts = shortcutParts(chord, apple);
  return (
    <span className={className} aria-hidden="true">
      {parts.join(apple ? " " : "+")}
    </span>
  );
}
export function ShortcutKeys({ chord }: { chord: Chord }) {
  const apple = useIsApple();
  return shortcutParts(chord, apple).map((part) => (
    <kbd key={part}>{part}</kbd>
  ));
}
