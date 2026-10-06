import { brandFramePath, brandPath } from "@/lib/brand";

export function LaunchScreen() {
  return (
    <main className="launch-screen" role="status" aria-label="Opening Nivra">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d={brandFramePath} fill="currentColor" />
        <path d={brandPath} fill="var(--background)" />
      </svg>
      <span className="sr-only">Opening Nivra</span>
    </main>
  );
}
