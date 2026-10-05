import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="Page not found."
      actions={
        <Button asChild>
          <Link href="/">Back to workspace</Link>
        </Button>
      }
    >
      This page may have moved, or the link is incomplete.
    </SystemPage>
  );
}
