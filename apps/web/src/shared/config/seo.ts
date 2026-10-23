import type { Metadata } from "next";
import { getSeoMessages } from "@hotkey-tools/i18n/seo";
import { languageTag, localizePath, type Locale } from "@hotkey-tools/i18n/routing";

export const SITE_URL = "https://www.loom-labs.ai";
export const SITE_NAME = "Loom AI";
export const SITE_DESCRIPTION = getSeoMessages("zh").description;
export const BRAND_IMAGE = {
  url: `${SITE_URL}/loom.png`,
  width: 1254,
  height: 1254,
  alt: getSeoMessages("zh").brandImageAlt,
};
const pages = [
  { path: "/", key: "home" },
  { path: "/vision", key: "vision" },
  { path: "/workspace", key: "workspace" },
  { path: "/pricing", key: "pricing" },
] as const;
export type PublicPath = (typeof pages)[number]["path"];
export function publicPagesForLocale(locale: Locale) {
  const messages = getSeoMessages(locale);
  return pages.map((page) => ({ path: page.path, ...messages.pages[page.key] }));
}
export const PUBLIC_PAGES = publicPagesForLocale("zh");
export function publicPageUrl(path: PublicPath, locale: Locale = "zh"): string {
  return new URL(localizePath(path, locale), SITE_URL).href;
}
export function createPageMetadata(path: PublicPath, locale: Locale = "zh"): Metadata {
  const page = publicPagesForLocale(locale).find((candidate) => candidate.path === path)!;
  const url = publicPageUrl(path, locale);
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: {
      canonical: url,
      languages: {
        "zh-CN": publicPageUrl(path, "zh"),
        en: publicPageUrl(path, "en"),
        "x-default": publicPageUrl(path, "zh"),
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      alternateLocale: locale === "zh" ? ["en_US"] : ["zh_CN"],
      siteName: SITE_NAME,
      url,
      title: page.title,
      description: page.description,
      images: [{ ...BRAND_IMAGE, alt: getSeoMessages(locale).brandImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [{ url: BRAND_IMAGE.url, alt: getSeoMessages(locale).brandImageAlt }],
    },
  };
}
export function createSiteStructuredData(locale: Locale) {
  const description = getSeoMessages(locale).description;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: {
          "@type": "ImageObject",
          url: BRAND_IMAGE.url,
          width: BRAND_IMAGE.width,
          height: BRAND_IMAGE.height,
          caption: getSeoMessages(locale).brandImageAlt,
        },
      },
      {
        "@type": "WebSite",
        name: SITE_NAME,
        url: publicPageUrl("/", locale),
        inLanguage: languageTag(locale),
        description,
      },
    ],
  };
}
export const siteStructuredData = createSiteStructuredData("zh");
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
export function createLlmsIndex(locale: Locale) {
  const m = getSeoMessages(locale);
  return `# ${SITE_NAME}\n\n> ${m.description}\n\n${m.boundary}\n\n## ${m.publicPages}\n\n${publicPagesForLocale(
    locale,
  )
    .map((page) => `- [${page.label}](${publicPageUrl(page.path, locale)}): ${page.description}`)
    .join(
      "\n",
    )}\n\n## ${m.publicText}\n\n- [${m.textLink}](${SITE_URL}${localizePath("/llms-full.txt", locale)}): ${m.textDescription}\n`;
}
export function createLlmsFullText(locale: Locale) {
  const m = getSeoMessages(locale);
  return `# ${SITE_NAME} ${m.publicTitle}\n\n> ${m.privateBoundary}\n\n${publicPagesForLocale(
    locale,
  )
    .map(
      (page) =>
        `## ${page.label}\n\n${m.pageLabel}: ${publicPageUrl(page.path, locale)}\n\n${page.content}`,
    )
    .join("\n\n")}\n`;
}
export const llmsIndex = createLlmsIndex("zh");
export const llmsFullText = createLlmsFullText("zh");
export const publicTextHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
  "X-Content-Type-Options": "nosniff",
  Link: `<${SITE_URL}/llms.txt>; rel="describedby"`,
};
