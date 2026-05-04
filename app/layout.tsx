import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BWIAA 2026",
    short_name: "BWIAA",
    description:
      "The official Booker Washington Institute Alumni Association portal. Vote, connect, and stay engaged.",

    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#D4A017",
    orientation: "portrait",

    icons: [
      // Standard icons
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },

      // Maskable versions (reuse same files)
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}