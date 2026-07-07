import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/audits/"] }], sitemap: `${base}/sitemap.xml` };
}
