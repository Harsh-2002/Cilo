export function plainText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value))
    return value.map(plainText).filter(Boolean).join("\n");
  const item = value as Record<string, unknown>;
  const parts = [
    typeof item.text === "string" ? item.text : "",
    typeof item.content === "string" ? item.content : plainText(item.content),
    plainText(item.children),
  ];
  if (item.type === "canvas" && item.props && typeof item.props === "object") {
    try {
      const scene = JSON.parse((item.props as { scene: string }).scene);
      parts.push(
        ...(scene.elements || []).map((e: { text?: string }) => e.text || ""),
      );
    } catch {}
  }
  return parts.filter(Boolean).join("\n");
}
