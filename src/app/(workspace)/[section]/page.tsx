import { notFound } from "next/navigation";
import { Nivra } from "@/components/nivra";
import { workspaceView, workspaceRoutes } from "@/lib/workspace-routes";
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.values(workspaceRoutes).map((path) => ({
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
  if (!view) notFound();
  return <Nivra initialView={view} />;
}
