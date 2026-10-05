// Last-known section data is shown while the next copy loads, so switching sections never flashes empty or foreign content.
const entries = new Map<string, unknown>();
export const sectionCache = {
  get<T>(key: string) {
    return entries.get(key) as T | undefined;
  },
  set(key: string, value: unknown) {
    entries.set(key, value);
  },
  clear(...prefixes: string[]) {
    for (const key of [...entries.keys()])
      if (!prefixes.length || prefixes.some((p) => key.startsWith(p)))
        entries.delete(key);
  },
};
if (typeof window !== "undefined")
  window.addEventListener("cilo:captured", (event) => {
    const type = (event as CustomEvent<{ type: string }>).detail?.type;
    sectionCache.clear(
      "overview",
      type === "note" ? "notes:" : type === "task" ? "tasks:" : "bookmarks:",
    );
  });
