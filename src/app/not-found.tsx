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
          <Link href="/">Go to Nivra</Link>
        </Button>
      }
    >
      Check the link, or return to Nivra to continue.
    </SystemPage>
  );
}
