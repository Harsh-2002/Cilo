import type { ReactNode } from "react";

export function ArtifactGallery({
  children,
  loading,
  layout = "grid",
}: {
  children: ReactNode;
  loading: boolean;
  layout?: "grid" | "list";
}) {
  return (
    <ul
      className={layout === "grid" ? "artifact-grid" : "artifact-list"}
      aria-label="Saved artifacts"
      aria-busy={loading}
    >
      {children}
    </ul>
  );
}
