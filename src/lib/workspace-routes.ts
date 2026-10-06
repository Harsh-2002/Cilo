export const workspaceRoutes = {
  overview: "/overview",
  all: "/notes",
  favorites: "/favorites",
  journal: "/journal",
  tasks: "/tasks",
  bookmarks: "/bookmarks",
  artifacts: "/artifacts",
  trash: "/trash",
} as const;
export type WorkspaceView = keyof typeof workspaceRoutes;
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
