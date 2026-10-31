import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { I18nProvider } from "@/components/I18n";
import type { Lang } from "@/lib/i18n";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "TRN FIT — المخزون",
  description: "TRN FIT inventory & barcode management",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TRN FIT", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0A0A0A",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang: Lang = jar.get("lang")?.value === "en" ? "en" : "ar";
  const theme = jar.get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-theme={theme} suppressHydrationWarning>
      <body className="min-h-dvh">
        <I18nProvider lang={lang}>{children}</I18nProvider>
        <SwRegister />
      </body>
    </html>
  );
}
