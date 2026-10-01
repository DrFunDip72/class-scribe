import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Class Scribe",
    short_name: "Class Scribe",
    description: "Private class transcription and study notes powered by local AI.",
    start_url: "/record",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f4",
    theme_color: "#187a59",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/class-scribe-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Record a class", short_name: "Record", url: "/record" },
      { name: "Your notes", short_name: "Notes", url: "/recordings" },
    ],
  };
}
