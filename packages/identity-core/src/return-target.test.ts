import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { validateReturnTarget, type ReturnTargetOptions } from "./return-target";

const production: ReturnTargetOptions = {
  loginUrl: "https://login.loom-labs.ai/",
  authEndpoint: "https://auth.loom-labs.ai",
};
const local: ReturnTargetOptions = {
  loginUrl: "http://localhost:3001/",
  authEndpoint: "https://auth.loom-labs.ai",
  localOrigins: ["http://localhost:3000", "http://localhost:3001/", "http://127.0.0.1:3000"],
};

function rejected(value: string, options = production) {
  try {
    validateReturnTarget(value, options);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "invalid_login_destination" });
    if (typeof value === "string" && value.length > 0) {
      expect((error as Error).message).not.toContain(value);
    }
    return;
  }
  throw new Error("Unsafe return destination was accepted");
}

describe("production product return destinations", () => {
  it.each([
    "https://www.loom-labs.ai/workspace?source=sso-check",
    "https://checkout.loom-labs.ai/account?order_id=fixture",
    "https://product.team.loom-labs.ai/",
    "https://www.loom-labs.ai/workspace?tag=a%20b&tag=c%2Bd&symbol=%7E&empty=",
    "https://www.loom-labs.ai/files/a%2Fb?label=%E4%B8%AD%E6%96%87&literal=%23value",
  ])("preserves the trusted path and original query: %s", (value) => {
    expect(validateReturnTarget(value, production)).toBe(value);
  });

  it("normalizes only the URL host and default HTTPS port", () => {
    expect(
      validateReturnTarget("HTTPS://WWW.LOOM-LABS.AI:443/workspace?q=a%20b&q=c%2bd", production),
    ).toBe("https://www.loom-labs.ai/workspace?q=a%20b&q=c%2bd");
  });

  it.each([
    "",
    " ",
    "/workspace",
    "//www.loom-labs.ai/workspace",
    "https:/www.loom-labs.ai/workspace",
    "https:www.loom-labs.ai/workspace",
    "javascript:alert(1)",
    "data:text/html,example",
    "ftp://www.loom-labs.ai/",
    "http://www.loom-labs.ai/",
    "https://loom-labs.ai/",
    "https://loom-labs.ai:443/",
    "https://evil.example/",
    "https://loom-labs.ai.evil.example/",
    "https://www.loom-labs.ai.evil.example/",
    "https://fake-loom-labs.ai/",
    "https://www.loom-labs.ai./",
    "https://.loom-labs.ai/",
    "https://a..loom-labs.ai/",
    "https://bad_name.loom-labs.ai/",
    "https://-bad.loom-labs.ai/",
    "https://bad-.loom-labs.ai/",
    "https://www.loom-labs.ai:444/",
    "https://www.loom-labs.ai:8443/",
    "https://www.loom-labs.ai:invalid/",
    "https://[broken/",
    "https://www.loom-labs.ai@evil.example/",
    "https://attacker@www.loom-labs.ai/",
    "https://user:secret@www.loom-labs.ai/",
    "https://:secret@www.loom-labs.ai/",
    "https://%77ww.loom-labs.ai/",
    "https://ｗｗｗ.loom-labs.ai/",
    "https://www.loom-labs。ai/",
    "https://www.lоom-labs.ai/",
    "https://xn--loom-lbs-yza.ai/",
    "https://www.loom-labs.ai\\@evil.example/",
    "https://www.loom-labs.ai/\\evil",
    "https://www.loom-labs.ai/\nworkspace",
    "https://www.loom-labs.ai/\rworkspace",
    "https://www.loom-labs.ai/\tworkspace",
    "https://www.loom-labs.ai/\u0000workspace",
    "https://www.loom-labs.ai/\u007fworkspace",
    "https://www.loom-labs.ai/workspace#section",
    "https://www.loom-labs.ai/workspace#",
    "https://www.loom-labs.ai/workspace?source=sso-check#section",
    "https://login.loom-labs.ai/",
    "https://LOGIN.LOOM-LABS.AI:443/workspace",
    "https://auth.loom-labs.ai/oidc/auth",
    "https://localhost:3000/workspace",
    "http://localhost:3000/workspace",
    `https://${"a".repeat(64)}.loom-labs.ai/`,
    `https://${Array.from({ length: 10 }, () => "a".repeat(30)).join(".")}.loom-labs.ai/`,
  ])("rejects an unsafe or unsupported return destination: %s", (value) => rejected(value));

  it("rejects malformed untrusted input before URL parsing", () => {
    rejected(null as unknown as string);
    rejected(42 as unknown as string);
  });

  it("excludes the configured portal/auth hosts, even when they use other product subdomains", () => {
    rejected("https://signin.loom-labs.ai/workspace", {
      ...production,
      loginUrl: "https://signin.loom-labs.ai/",
    });
    rejected("https://identity.loom-labs.ai/", {
      ...production,
      authEndpoint: "https://identity.loom-labs.ai/oidc",
    });
  });

  it.each([
    { loginUrl: "not-a-url" },
    { authEndpoint: "not-a-url" },
    { loginUrl: "https://user:secret@login.loom-labs.ai" },
    { authEndpoint: "https://user:secret@auth.loom-labs.ai" },
    { loginUrl: "http://login.loom-labs.ai/" },
    { authEndpoint: "ftp://auth.loom-labs.ai/" },
    { loginUrl: "https://login.loom-labs.ai/path" },
    { loginUrl: "https://login.loom-labs.ai/?source=other" },
    { authEndpoint: "https://auth.loom-labs.ai/?source=other" },
  ])("fails closed for invalid trusted-origin configuration: %j", (override) => {
    rejected("https://www.loom-labs.ai/workspace", { ...production, ...override });
  });
});

describe("explicit local return origins", () => {
  it.each([
    "http://localhost:3000/workspace?source=sso-check",
    "http://localhost:3001/workspace?q=a%20b&q=c%2Bd",
    "http://127.0.0.1:3000/pricing",
  ])("allows only an explicitly configured loopback origin: %s", (value) => {
    expect(validateReturnTarget(value, local)).toBe(value);
  });

  it("supports explicitly configured IPv6 loopback", () => {
    const value = "http://[::1]:3000/workspace?source=sso-check";
    expect(
      validateReturnTarget(value, {
        ...local,
        loginUrl: "http://[::1]:3001/",
        localOrigins: ["http://[::1]:3000/"],
      }),
    ).toBe(value);
  });

  it.each([
    "http://localhost:3002/workspace",
    "http://127.0.0.1:3001/workspace",
    "http://localhost.evil.example:3000/",
    "http://www.loom-labs.ai/workspace",
    "https://localhost:3000/workspace",
    "http://localhost:3000/workspace#section",
  ])("rejects an unlisted or invalid local destination: %s", (value) => rejected(value, local));

  it("does not enable loopback destinations in production or without an explicit origin", () => {
    rejected("http://localhost:3000/workspace", {
      ...production,
      localOrigins: local.localOrigins,
    });
    rejected("http://localhost:3000/workspace", { ...local, localOrigins: undefined });
    rejected("http://localhost:3000/workspace", {
      ...local,
      loginUrl: "http://login.loom-labs.ai/",
    });
    rejected("http://localhost:3000/workspace", {
      ...local,
      loginUrl: "https://localhost:3001/",
    });
  });

  it.each([
    "http://localhost:3000/workspace",
    "http://localhost:3000/?source=other",
    "http://localhost:3000/#section",
    "http://user:secret@localhost:3000/",
    "http://evil.example:3000/",
    "https://localhost:3000/",
  ])("rejects a malformed local origin registry: %s", (origin) => {
    rejected("http://localhost:3000/workspace", { ...local, localOrigins: [origin] });
  });
});
