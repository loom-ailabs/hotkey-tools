import { defineRouting } from "next-intl/routing";

export const locales = ["zh", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "zh";
export const LOCALE_COOKIE = "LOOM_LOCALE";
export const isLocale = (value: unknown): value is Locale => value === "zh" || value === "en";
export const languageTag = (locale: Locale) => (locale === "zh" ? "zh-CN" : "en");

export function localeCookieOptions(hostname: string, secure = true) {
  return {
    name: LOCALE_COOKIE,
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: 365 * 24 * 60 * 60,
    ...(hostname.endsWith(".loom-labs.ai") ? { domain: ".loom-labs.ai" } : {}),
  };
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  alternateLinks: false,
  // Proxy removes Accept-Language. Only an explicit preference cookie negotiates a locale.
  localeDetection: true,
  // The proxy supplies host-aware options. Navigation must not create a
  // host-only cookie that could shadow the shared parent-domain preference.
  localeCookie: false,
});

export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:zh|en)(?=\/|$)/, "") || "/";
}

/** Real page paths only. API and authentication URLs are never prefixed. */
export function localizePath(value: string, locale: Locale): string {
  const noHash = value.split("#", 1)[0]!;
  if (!noHash.startsWith("/") || noHash.startsWith("//") || noHash.includes("\\"))
    throw new TypeError("Expected a local page path");
  const queryAt = noHash.indexOf("?");
  const path = stripLocale(queryAt === -1 ? noHash : noHash.slice(0, queryAt));
  const query = queryAt === -1 ? "" : noHash.slice(queryAt);
  if (path === "/api" || path.startsWith("/api/")) return `${path}${query}`;
  return `${locale === "en" ? `/en${path === "/" ? "" : path}` : path}${query}`;
}

export function localizeUrl(value: string, locale: Locale): string {
  const url = new URL(value);
  const localized = localizePath(`${url.pathname}${url.search}`, locale);
  return `${url.origin}${localized}`;
}

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
  }
}
