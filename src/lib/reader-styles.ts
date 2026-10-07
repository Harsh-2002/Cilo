const colors: Record<string, string> = {
  gray: "#737373",
  red: "#c43c3c",
  orange: "#b85c10",
  yellow: "#947100",
  green: "#258044",
  blue: "#326bc5",
  purple: "#8558bf",
  pink: "#b84688",
};
function color(value: unknown) {
  return typeof value === "string"
    ? Object.hasOwn(colors, value)
      ? colors[value]
      : /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
        ? value.toLowerCase()
        : undefined
    : undefined;
}
export function readerStyle(value: Record<string, unknown>) {
  const foreground = color(value.textColor),
    background = color(value.backgroundColor);
  const alignment = ["left", "center", "right", "justify"].includes(
    String(value.textAlignment),
  )
    ? String(value.textAlignment)
    : undefined;
  const declarations = [
    foreground && `color:${foreground}`,
    background && `background-color:${background}`,
    alignment && `text-align:${alignment}`,
  ]
    .filter(Boolean)
    .join(";");
  if (!declarations) return { name: undefined, rule: "" };
  const name = `reader-style-${foreground?.slice(1) || "none"}-${background?.slice(1) || "none"}-${alignment || "none"}`;
  return { name, rule: `.${name}{${declarations}}` };
}
export function readerStyles(document: unknown) {
  const rules = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const rule = readerStyle(value as Record<string, unknown>).rule;
    if (rule) rules.add(rule);
    Object.values(value).forEach(visit);
  };
  visit(document);
  return [...rules].join("\n");
}
