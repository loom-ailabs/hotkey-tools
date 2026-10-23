import type { NextRequest } from "next/server";
import { localeProxy } from "@hotkey-tools/i18n/proxy";
export default function proxy(request: NextRequest) {
  return localeProxy(request);
}
export const config = { matcher: "/((?!api(?:/|$)|_next|_vercel|.*\\..*).*)" };
