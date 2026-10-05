import "@fontsource-variable/geist";
import type { Metadata, Viewport } from "next";
import { themeBootstrap } from "@/lib/theme";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nivra — a quiet place to think",
  description:
    "Your notes, diagrams, and ideas. A minimal, self-hosted workspace.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Nivra" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="nivra-theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
      </head>
      <body>
        <Providers>
          <div className="bn-scroll-container">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
