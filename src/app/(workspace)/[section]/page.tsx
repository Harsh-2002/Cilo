import { notFound } from "next/navigation";
import { Nivra } from "@/components/nivra";
import {
  workspaceView,
  workspaceRoutes,
  workspaceSurfaces,
  workspaceSurface,
} from "@/lib/workspace-routes";
export const dynamicParams = false;
export function generateStaticParams() {
  return [
    ...Object.values(workspaceRoutes),
    ...workspaceSurfaces.map((surface) => `/${surface}`),
  ].map((path) => ({
    section: path.slice(1),
  }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const view = workspaceView(`/${section}`);
  if (!view && !workspaceSurface(`/${section}`)) notFound();
  return <Nivra initialView={view ?? "overview"} />;
}
