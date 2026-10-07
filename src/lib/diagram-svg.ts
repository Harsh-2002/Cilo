export function diagramSvg(svg: string, nonce: string | undefined) {
  const root = new DOMParser().parseFromString(
    svg,
    "image/svg+xml",
  ).documentElement;
  if (root.tagName !== "svg") throw new Error("Invalid diagram output.");
  const cleanCss = (css: string) =>
    css
      .replace(/@import[^;]*;?/gi, "")
      .replace(/url\(([^)]*)\)/gi, (match, value: string) =>
        /^\s*['"]?#[a-zA-Z0-9_-]+['"]?\s*$/.test(value) ? match : "none",
      );
  for (const node of [...root.querySelectorAll("[style]"), root]) {
    const value = node.getAttribute("style");
    if (!value) continue;
    node.removeAttribute("style");
    node.setAttribute("data-nivra-style", cleanCss(value));
  }
  for (const style of root.querySelectorAll("style")) {
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = cleanCss(style.textContent || "");
  }
  return new XMLSerializer().serializeToString(root);
}
