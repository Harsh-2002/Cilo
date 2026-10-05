"use client";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
export default function ErrorPage() {
  return (
    <SystemPage
      title="Something went wrong."
      actions={
        <>
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to workspace</Link>
          </Button>
        </>
      }
    >
      We couldn’t open this page. Try again in a moment.
    </SystemPage>
  );
}
