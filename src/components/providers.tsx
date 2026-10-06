"use client";
import { ConfirmProvider } from "./confirm-provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useEffect } from "react";
// The server layout initializes theme; client remounts need no executable script.
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    else
      navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          for (const registration of registrations) {
            const worker = registration.active || registration.waiting;
            if (worker?.scriptURL === `${location.origin}/sw.js`)
              await registration.unregister();
          }
          for (const name of await caches.keys())
            if (name.startsWith("nivra-static-")) await caches.delete(name);
        })
        .catch(() => {});
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="nivra-theme"
      scriptProps={{ type: "text/plain" }}
    >
      <Toaster richColors closeButton />
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  );
}
