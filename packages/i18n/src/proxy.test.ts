import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { localeProxy } from "./proxy";

function response(path: string, cookie = "", acceptLanguage = "en-US,en") {
  return localeProxy(
    new NextRequest(`https://www.loom-labs.ai${path}`, {
      headers: { cookie, "accept-language": acceptLanguage },
    }),
  );
}
describe("page locale negotiation", () => {
  it("defaults to Chinese regardless of browser language and serves explicit English", () => {
    expect(response("/pricing").headers.get("x-middleware-rewrite")).toBe(
      "https://www.loom-labs.ai/zh/pricing",
    );
    expect(
      response("/en/pricing", "LOOM_LOCALE=zh").headers.get("x-middleware-rewrite"),
    ).toBeNull();
  });
  it("shares only a validated language preference and preserves query through redirects", () => {
    const result = response("/pricing?q=a%2Bb&tag=1&tag=2", "LOOM_LOCALE=en");
    expect(result.headers.get("location")).toBe(
      "https://www.loom-labs.ai/en/pricing?q=a%2Bb&tag=1&tag=2",
    );
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(response("/pricing", "LOOM_LOCALE=invalid").headers.get("location")).toBeNull();
    const cookie = response("/en/pricing").headers.get("set-cookie");
    expect(cookie).toContain("LOOM_LOCALE=en");
    expect(cookie).toContain("Domain=.loom-labs.ai");
    expect(cookie).toContain("Secure");
  });
  it("leaves APIs, callbacks, assets and public machine-readable feeds untouched", () => {
    for (const path of [
      "/api/auth/callback?code=fixture",
      "/api/webhooks/stripe",
      "/api/me",
      "/_next/static/app.js",
      "/sitemap.xml",
      "/robots.txt",
      "/llms.txt",
    ]) {
      const result = response(path, "LOOM_LOCALE=en");
      expect(result.headers.has("location")).toBe(false);
      expect(result.headers.has("x-middleware-rewrite")).toBe(false);
      expect(result.headers.has("set-cookie")).toBe(false);
      expect(result.headers.has("cache-control")).toBe(false);
    }
  });
});
