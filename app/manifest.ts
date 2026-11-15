import type { MetadataRoute } from "next";

// Lets people install Bus Buddy to their home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bus Buddy",
    short_name: "Bus Buddy",
    description: "Live Winnipeg Transit arrivals, bus tracking and trip planning.",
    start_url: "/",
    display: "standalone",
    background_color: "#c98f55",
    theme_color: "#c98f55",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
