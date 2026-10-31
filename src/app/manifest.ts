import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRN FIT — المخزون",
    short_name: "TRN FIT",
    description: "TRN FIT inventory & barcode scanner",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icons/trn-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "مسح باركود", short_name: "Scan", url: "/scan", icons: [{ src: "/icons/trn-app-icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
  };
}
