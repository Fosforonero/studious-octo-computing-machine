import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site";
  return [{ url: base, changeFrequency: "weekly", priority: 1 }];
}
