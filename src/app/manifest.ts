import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lensiq",
    short_name: "Lensiq",
    description: "AI website clarity and conversion auditor",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#06122f",
    icons: [
      {
        src: "/lensiq-favicon.webp",
        sizes: "431x430",
        type: "image/webp",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
