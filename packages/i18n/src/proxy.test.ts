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
  it("defaults to English regardless of browser language and gives explicit Chinese precedence", () => {
    expect(response("/pricing", "", "zh-CN,zh").headers.get("x-middleware-rewrite")).toBe(
      "https://www.loom-labs.ai/en/pricing",
    );
    const explicit = response("/zh/pricing", "LOOM_LOCALE=en");
    expect(explicit.headers.get("location")).toBeNull();
    expect(explicit.headers.get("set-cookie")).toContain("LOOM_LOCALE=zh");
  });
  it("preserves a saved Chinese preference and raw query while ignoring invalid preferences", () => {
    const result = response("/pricing?q=a%2Bb&tag=1&tag=2", "LOOM_LOCALE=zh");
    expect(result.headers.get("location")).toBe(
      "https://www.loom-labs.ai/zh/pricing?q=a%2Bb&tag=1&tag=2",
    );
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(response("/pricing", "LOOM_LOCALE=invalid").headers.get("location")).toBeNull();
    expect(response("/pricing", "LOOM_LOCALE=en").headers.get("location")).toBeNull();
    const cookie = response("/zh/pricing").headers.get("set-cookie");
    expect(cookie).toContain("LOOM_LOCALE=zh");
    expect(cookie).toContain("Domain=.loom-labs.ai");
    expect(cookie).toContain("Secure");
  });
  it("normalizes legacy English prefixes without losing query or retaining an old Chinese preference", () => {
    const result = response("/en/workspace?source=old&keep=a%2Bb&tag=1&tag=2", "LOOM_LOCALE=zh");
    expect(result.headers.get("location")).toBe(
      "https://www.loom-labs.ai/workspace?source=old&keep=a%2Bb&tag=1&tag=2",
    );
    expect(result.headers.get("set-cookie")).toContain("LOOM_LOCALE=en");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(
      response("/en?returnTo=https%3A%2F%2Fwww.loom-labs.ai%2Fpricing").headers.get("location"),
    ).toBe("https://www.loom-labs.ai/?returnTo=https%3A%2F%2Fwww.loom-labs.ai%2Fpricing");
  });
  it("rejects localized protocol aliases instead of redirecting them to live endpoints", () => {
    for (const locale of ["en", "zh"]) {
      for (const path of [
        "/api/me",
        "/api/auth/callback?code=fixture",
        "/api/webhooks/stripe",
        "/_next/internal",
        "/_vercel/internal",
      ]) {
        const result = response(`/${locale}${path}`, "LOOM_LOCALE=zh");
        expect(result.status).toBe(404);
        expect(result.headers.has("location")).toBe(false);
        expect(result.headers.has("x-middleware-rewrite")).toBe(false);
        expect(result.headers.has("set-cookie")).toBe(false);
      }
    }
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
