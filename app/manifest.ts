import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeamKasse",
    short_name: "TeamKasse",
    description: "Deine Mannschaftskasse. Gemeinsam im Blick.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "de",
    background_color: "#f6f8f7",
    theme_color: "#167b58",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
