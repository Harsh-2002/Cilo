import { ArtifactGallery } from "./artifact-gallery";

type Kind =
  | "notes"
  | "tasks"
  | "trash"
  | "bookmarks"
  | "artifact-list"
  | "gallery"
  | "overview"
  | "editor"
  | "viewer"
  | "search"
  | "clock";
const Bar = ({ className = "" }: { className?: string }) => (
  <span className={`loading-bar ${className}`} />
);
export function LoadingState({ kind, label }: { kind: Kind; label: string }) {
  const row = (index: number) => (
    <div className="loading-row" key={index}>
      {kind !== "notes" && (
        <Bar className={kind === "trash" ? "loading-icon" : "loading-check"} />
      )}
      <div className="loading-copy">
        <Bar />
        <Bar className="loading-short" />
      </div>
      {kind === "trash" && <Bar className="loading-action" />}
    </div>
  );
  let content;
  if (kind === "gallery") {
    content = (
      <ArtifactGallery loading>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <li className="loading-card" key={index}>
            <div className="loading-media">
              <Bar />
            </div>
            <div className="loading-caption">
              <Bar />
              <Bar className="loading-menu" />
            </div>
          </li>
        ))}
      </ArtifactGallery>
    );
  } else if (kind === "bookmarks") {
    content = (
      <div className="bookmark-grid">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div className="loading-card" key={index}>
            <div className="loading-media">
              <Bar />
            </div>
            <div className="loading-card-copy">
              <Bar />
              <Bar className="loading-short" />
              <Bar />
              <Bar className="loading-short" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (kind === "overview") {
    content = (
      <div className="overview-grid">
        {["tasks", "notes", "bookmarks"].map((panel) => (
          <div className={`overview-widget overview-${panel}`} key={panel}>
            <Bar className="loading-widget-title" />
            {[0, 1, 2].map((index) => (
              <div className="loading-widget-row" key={index}>
                <Bar />
                <Bar className="loading-short" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  } else if (kind === "editor" || kind === "viewer") {
    content = (
      <div className="loading-article">
        {kind === "viewer" && (
          <div className="loading-media">
            <Bar />
          </div>
        )}
        {[0, 1, 2].map((index) => (
          <div className="loading-paragraph" key={index}>
            <Bar />
            <Bar />
            <Bar className="loading-short" />
          </div>
        ))}
      </div>
    );
  } else if (kind === "clock") {
    content = (
      <>
        <Bar />
        <Bar />
        <Bar />
      </>
    );
  } else {
    content = Array.from({ length: kind === "search" ? 3 : 6 }, (_, index) =>
      row(index),
    );
  }
  return (
    <div
      className={`loading-state loading-${kind}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div aria-hidden="true">{content}</div>
    </div>
  );
}
