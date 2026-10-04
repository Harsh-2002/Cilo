import { permanentRedirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LegacyPublication({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  permanentRedirect(`/share/${encodeURIComponent((await params).token)}`);
}
