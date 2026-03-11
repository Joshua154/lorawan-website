import type { Metadata, Viewport } from "next";

import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { TranslationProvider } from "@/i18n/useTranslation";

import "./globals.css";

export const metadata: Metadata = {
  title: "LoRaWAN GPS Dashboard",
  description: "Next.js dashboard for LoRaWAN GPS pings, live updates, and board imports.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css"
        />
        <TranslationProvider>
          <LanguageSwitcher />
          {children}
        </TranslationProvider>
      </body>
    </html>
  );
}
