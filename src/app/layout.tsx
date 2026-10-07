import "@fontsource-variable/geist";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { brandDescription } from "@/lib/brand";
import { launchImages } from "@/lib/pwa.mjs";
import { themeBootstrap } from "@/lib/theme";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nivra — your personal brain",
  description: brandDescription,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nivra",
    startupImage: launchImages.map(({ url, media }) => ({ url, media })),
  },
  icons: { icon: "/icon.svg?v=5", apple: "/icons/apple-touch-icon.png?v=5" },
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
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nivra-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="nivra-theme-bootstrap"
          nonce={nonce}
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
