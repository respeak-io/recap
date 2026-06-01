import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/docs-locale";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep the app surface (dashboard, auth, API) out of the index — only the
        // public docs (`/<locale>/<projectSlug>/…`) should be crawled.
        disallow: [
          "/api/",
          "/project/",
          "/dashboard",
          "/login",
          "/signup",
          "/callback",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
