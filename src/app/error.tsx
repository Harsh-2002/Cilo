"use client";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <SystemPage
      code="500"
      title="Something went wrong."
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Go to Nivra</Link>
          </Button>
        </>
      }
    >
      We couldn’t open this page. Try again in a moment.
    </SystemPage>
  );
}
