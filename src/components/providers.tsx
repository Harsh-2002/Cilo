"use client";
import { ConfirmProvider } from "./confirm-provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useEffect } from "react";
// The server layout initializes theme; client remounts need no executable script.
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="cilo-theme"
      scriptProps={{ type: "text/plain" }}
    >
      <Toaster richColors closeButton />
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  );
}
