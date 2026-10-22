import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { GET as getLlmsIndex } from "@/app/llms.txt/route";
import { GET as getLlmsFullText } from "@/app/llms-full.txt/route";
import { createPageMetadata, PUBLIC_PAGES, serializeJsonLd, siteStructuredData } from "./seo";

const publicUrls = [
  "https://www.loom-labs.ai/",
  "https://www.loom-labs.ai/vision",
  "https://www.loom-labs.ai/workspace",
  "https://www.loom-labs.ai/pricing",
];

describe("public search and agent discovery", () => {
  it("limits the sitemap to canonical public pages without fabricated publication dates", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(publicUrls);
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);
    expect(robots()).toMatchObject({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://www.loom-labs.ai/sitemap.xml",
    });
  });

  it("gives each public route its own canonical and social identity regardless of request parameters", () => {
    const titles = new Set();
    for (const [index, page] of PUBLIC_PAGES.entries()) {
      const metadata = createPageMetadata(page.path);
      expect(metadata.alternates?.canonical).toBe(publicUrls[index]);
      expect(metadata.openGraph?.url).toBe(publicUrls[index]);
      titles.add(JSON.stringify(metadata.title));
    }
    expect(titles.size).toBe(4);
  });

  it("serves cacheable plain text without exposing account or transaction endpoints", async () => {
    for (const response of [getLlmsIndex(), getLlmsFullText()]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("Cache-Control")).toContain("public");
      const text = await response.text();
      for (const url of publicUrls) expect(text).toContain(url);
      expect(text).toContain("Sandbox");
      expect(text).toContain("预置");
      expect(text).not.toMatch(/https?:\/\/[^\s)]*\/api\//);
      expect(text).not.toMatch(/https?:\/\/(?:login|checkout|auth)\./);
      expect(text).not.toMatch(/(?:sk_test_|whsec_|Bearer |session_id=)/);
    }
  });

  it("keeps JSON-LD inert and limits claims to the actual website and organization", () => {
    const hostile = { description: "</script><script>alert('fixture')</script>" };
    expect(serializeJsonLd(hostile)).not.toContain("<");
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
    const structuredData = JSON.parse(serializeJsonLd(siteStructuredData));
    expect(structuredData["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
    ]);
    expect(JSON.stringify(structuredData)).not.toMatch(
      /Offer|AggregateRating|Review|priceCurrency/,
    );
  });
});
