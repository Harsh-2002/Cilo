"use client";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";
import "./globals.css";
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <SystemPage
          code="500"
          title="Nivra couldn’t start."
          actions={
            <Button onClick={() => window.location.reload()}>Try again</Button>
          }
        >
          Please try again. If this continues, check the server connection.
        </SystemPage>
      </body>
    </html>
  );
}
