import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config/seo";

export default function robots(): MetadataRoute.Robots {
  // Private APIs use authentication and X-Robots-Tag; robots.txt is not access control.
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
