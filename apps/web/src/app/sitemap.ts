import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, publicPageUrl } from "@/shared/config/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // Omit lastModified until a real publication timestamp is maintained.
  return PUBLIC_PAGES.map((page) => ({ url: publicPageUrl(page.path) }));
}
