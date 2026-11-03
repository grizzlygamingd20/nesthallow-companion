import type { MetadataRoute } from "next";

// Lets Android Chrome install the Naturalist like an app ("Add to Home screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grove Naturalist",
    short_name: "Naturalist",
    description: "The Keeper and Nesthallow's field journal.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5e9c9",
    theme_color: "#7a4b2a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
