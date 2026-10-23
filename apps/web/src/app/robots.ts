import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config/seo";

export default function robots(): MetadataRoute.Robots {
  // Private APIs use authentication and X-Robots-Tag; robots.txt is not access control.
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account", "/zh/account", "/en/account"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
