"use client";
import { useLocale } from "next-intl";
import { createElement, type ComponentProps } from "react";
import NextLink from "next/link";
import { createNavigation } from "next-intl/navigation";
import { usePathname as useNextPathname } from "next/navigation";
import {
  LOCALE_COOKIE,
  isLocale,
  localizePath,
  localeCookieOptions,
  routing,
  type Locale,
} from "./routing";

export { useTranslations, useLocale, useFormatter, NextIntlClientProvider } from "next-intl";
export { isLocale, localizePath, localizeUrl, stripLocale, type Locale } from "./routing";
const navigation = createNavigation(routing);
export const { usePathname, useRouter, getPathname } = navigation;
export function Link(props: ComponentProps<typeof navigation.Link>) {
  const pathname = typeof props.href === "string" ? props.href : props.href.pathname;
  if (pathname && /^\/api(?:\/|\?|$)/.test(pathname)) {
    const { locale: _locale, ...native } = props;
    return createElement(NextLink, native);
  }
  return createElement(navigation.Link, props);
}

/** Switching is an explicit document navigation: preserve the raw query, discard fragments. */
export function useLocaleSwitcher() {
  const current = useLocale();
  const pathname = useNextPathname();
  const locale: Locale = isLocale(current) ? current : "en";
  function localeHref(next: Locale) {
    return localizePath(
      typeof window === "undefined"
        ? pathname
        : `${window.location.pathname}${window.location.search}`,
      next,
    );
  }
  function switchLocale(next: Locale) {
    if (!isLocale(next)) return;
    const options = localeCookieOptions(
      window.location.hostname,
      window.location.protocol === "https:",
    );
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${options.maxAge}; SameSite=Lax${options.secure ? "; Secure" : ""}${options.domain ? `; Domain=${options.domain}` : ""}`;
    window.location.assign(localeHref(next));
  }
  return { locale, switchLocale, localeHref };
}
