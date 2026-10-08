import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegistration from "@/components/pwa-registration";
export const metadata: Metadata = {
  title: "TeamKasse · Alles im Team",
  description: "Die übersichtliche Mannschaftskasse für dein Team.",
  applicationName: "TeamKasse",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TeamKasse" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#167b58",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
