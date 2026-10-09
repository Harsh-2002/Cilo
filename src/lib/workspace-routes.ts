export const workspaceRoutes = {
  overview: "/overview",
  all: "/notes",
  favorites: "/favorites",
  journal: "/journal",
  tasks: "/tasks",
  calendar: "/calendar",
  bookmarks: "/bookmarks",
  artifacts: "/artifacts",
  trash: "/trash",
} as const;
export type WorkspaceView = keyof typeof workspaceRoutes;
export const workspaceSurfaces = ["search", "settings"] as const;
export function workspaceSurface(pathname: string) {
  return workspaceSurfaces.find(
    (surface) => `/${surface}` === pathname.replace(/\/$/, ""),
  );
}
export function workspaceView(pathname: string): WorkspaceView | null {
  if (pathname === "/") return "overview";
  return (
    (Object.entries(workspaceRoutes).find(
      ([, path]) => path === pathname.replace(/\/$/, ""),
    )?.[0] as WorkspaceView | undefined) ?? null
  );
}
export function workspacePath(view: string): string {
  return workspaceRoutes[view as WorkspaceView] ?? workspaceRoutes.all;
}

export function cleanWorkspaceUrl(url: URL): URL {
  const result = new URL(url);
  const view = workspaceView(result.pathname);
  if (!view) return result;
  const keys =
    view === "calendar"
      ? [
          "date",
          "view",
          "mode",
          "event",
          "occurrence",
          "new",
          "link",
          "linkType",
          "linkTitle",
        ]
      : view === "tasks"
        ? ["view", "board", "stage", "task"]
        : ["all", "journal", "favorites"].includes(view)
          ? ["note", "tag"]
          : view === "artifacts" || view === "bookmarks"
            ? ["tag"]
            : [];
  for (const key of [...result.searchParams.keys()])
    if (!keys.includes(key)) result.searchParams.delete(key);
  if (
    view === "tasks" &&
    !["list", "board"].includes(result.searchParams.get("view") ?? "")
  )
    result.searchParams.delete("view");
  return result;
}
