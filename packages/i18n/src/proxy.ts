import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { localeCookieOptions, routing } from "./routing";

export function localeProxy(request: NextRequest) {
  if (
    /^\/(?:api|_next|_vercel)(?:\/|$)/.test(request.nextUrl.pathname) ||
    request.nextUrl.pathname.includes(".")
  )
    return NextResponse.next();
  // Chinese remains the default regardless of browser settings. Explicit URL and
  // the user's non-sensitive preference cookie retain their normal precedence.
  const headers = new Headers(request.headers);
  headers.delete("accept-language");
  const localized = new NextRequest(request, { headers });
  const response = createMiddleware({
    ...routing,
    localeCookie: localeCookieOptions(
      request.nextUrl.hostname,
      request.nextUrl.protocol === "https:",
    ),
  })(localized);
  // Page redirects and SSR vary by an explicit preference. Never let a shared
  // cache reuse that decision; machine-readable public feeds bypass this proxy.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
