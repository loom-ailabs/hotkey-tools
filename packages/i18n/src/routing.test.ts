import { describe, expect, it } from "vitest";
import { isLocale, localizePath, localizeUrl, localeCookieOptions, stripLocale } from "./routing";

describe("localized product paths", () => {
  it("retains the unprefixed Chinese paths and gives English a genuine prefix", () => {
    expect(localizePath("/", "zh")).toBe("/");
    expect(localizePath("/", "en")).toBe("/en");
    expect(localizePath("/en/pricing", "zh")).toBe("/pricing");
    expect(localizePath("/pricing", "en")).toBe("/en/pricing");
    expect(stripLocale("/english")).toBe("/english");
    expect(stripLocale("/zh/workspace")).toBe("/workspace");
  });
  it("preserves raw query serialization and a return target while dropping fragments", () => {
    const query = "?returnTo=https%3A%2F%2Fwww.loom-labs.ai%2Fworkspace%3Fx%3D1&tag=a%2Bb&tag=2";
    expect(localizePath(`/en${query}#legacy`, "zh")).toBe(`/${query}`);
    expect(localizeUrl(`https://checkout.loom-labs.ai/${query}#old`, "en")).toBe(
      `https://checkout.loom-labs.ai/en${query}`,
    );
  });
  it("never prefixes protocol endpoints and rejects non-local page paths", () => {
    for (const path of ["/api/auth/login?returnTo=x", "/api/auth/callback", "/api/webhooks/stripe"])
      expect(localizePath(path, "en")).toBe(path);
    for (const invalid of ["https://outside.test/", "//outside.test/", "/\\outside.test/"])
      expect(() => localizePath(invalid, "en")).toThrow(TypeError);
  });
  it("keeps the preference non-sensitive and restricts the configured parent cookie domain", () => {
    expect(localeCookieOptions("login.loom-labs.ai")).toMatchObject({
      name: "LOOM_LOCALE",
      domain: ".loom-labs.ai",
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(localeCookieOptions("localhost", false)).not.toHaveProperty("domain");
    expect(localeCookieOptions("loom-labs.ai.evil.test")).not.toHaveProperty("domain");
    for (const value of ["zh", "en"]) expect(isLocale(value)).toBe(true);
    for (const value of ["fr", "en-US", "", null, undefined]) expect(isLocale(value)).toBe(false);
  });
});
