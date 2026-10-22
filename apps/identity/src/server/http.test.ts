import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, jsonError, jsonSuccess, requireSameOrigin } from "./http";
import { HTTP_ERROR_CODES } from "./http-codes";

afterEach(() => vi.restoreAllMocks());

describe("JSON response format", () => {
  it("wraps successful data without an error and disables private response caching", async () => {
    const response = jsonSuccess({
      checkoutUrl: "https://checkout.stripe.com/test",
      orderId: "order-1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: { checkoutUrl: "https://checkout.stripe.com/test", orderId: "order-1" },
    });
  });

  it("keeps the HTTP status and a stable positive business code without success data", async () => {
    const response = jsonError(new ApiError(403, "premium_required", "购买后可访问。"));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      code: HTTP_ERROR_CODES.premium_required,
      msg: "购买后可访问。",
      error: { type: "premium_required" },
    });
  });

  it("registers each business error with a unique, positive integer", () => {
    const codes = Object.values(HTTP_ERROR_CODES);
    expect(codes.every((code) => Number.isSafeInteger(code) && code > 0)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("hides unknown errors from clients while retaining redacted stack and causes in logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("provider payload=raw-webhook token=sk_test_do_not_expose");
    cause.stack = `${cause.name}: ${cause.message}\n    at remote (https://user:password@stripe.example.test/handler.ts:12:4?token=whsec_private#fragment)`;
    const error = new Error("request body={sensitive:true}\n    at injected-body", { cause });
    Object.assign(error, { request: { body: "raw-webhook" }, accessToken: "private-token" });
    const response = jsonError(error);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      code: HTTP_ERROR_CODES.service_unavailable,
      msg: "服务暂时不可用，请稍后重试。",
      error: { type: "service_unavailable" },
    });
    expect(log).toHaveBeenCalledOnce();
    const diagnostic = log.mock.calls[0]![1] as { stack: string; cause: { stack: string } };
    expect(diagnostic.stack).toContain("http.test.ts");
    expect(diagnostic.cause.stack).toContain("handler.ts:12:4");
    const output = JSON.stringify(diagnostic);
    for (const sensitive of [
      "sk_test_",
      "whsec_",
      "password",
      "raw-webhook",
      "private-token",
      "sensitive",
      "injected-body",
    ]) {
      expect(output).not.toContain(sensitive);
    }
  });

  it("retains causes of safe service errors without returning provider data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = jsonError(
      new ApiError(502, "checkout_unavailable", "收银台暂不可用。", {
        cause: new Error("provider secret=sk_test_private"),
      }),
    );
    expect(await response.json()).toEqual({
      code: HTTP_ERROR_CODES.checkout_unavailable,
      msg: "收银台暂不可用。",
      error: { type: "checkout_unavailable" },
    });
    expect(log.mock.calls[0]![1]).toHaveProperty("cause.stack");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk_test_private");
  });
});

describe("safe provider diagnostics", () => {
  it.each([
    "sign_in_session.not_found",
    "callback_uri_verification.state_mismatched",
    "unexpected_response_error",
    "http_error_401",
    "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    "ERR_JWT_CLAIM_VALIDATION_FAILED",
    "ERR_JWKS_TIMEOUT",
  ])("logs the known SDK code %s without returning it to the browser", async (code) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = jsonError(Object.assign(new Error("private provider message"), { code }));
    expect(log.mock.calls[0]![1]).toMatchObject({ code });
    expect(await response.json()).toMatchObject({
      code: HTTP_ERROR_CODES.service_unavailable,
      error: { type: "service_unavailable" },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private provider message");
  });

  it("extracts only a standard OAuth error from the SDK's response wrapper", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = jsonError(
      Object.assign(new Error("private token response"), {
        name: "LogtoError",
        code: "unexpected_response_error",
        data: {
          error: "invalid_client",
          error_description: "client_secret=private-client-secret",
          access_token: "sk_test_do_not_log",
        },
      }),
    );
    expect(log.mock.calls[0]![1]).toMatchObject({
      code: "unexpected_response_error",
      oauthError: "invalid_client",
    });
    for (const output of [JSON.stringify(log.mock.calls), await response.text()]) {
      expect(output).not.toContain("private-client-secret");
      expect(output).not.toContain("sk_test_do_not_log");
      expect(output).not.toContain("error_description");
    }
  });

  it.each([
    "sk_test_fake_secret",
    "whsec_fake_secret",
    "callback_uri_verification.state_mismatched sk_test_fake_secret",
    "http_error_401?client_secret=fake-secret",
    "ERR_JWT_EXPIRED\nwhsec_fake_secret",
    "unknown_provider_error",
  ])("omits unrecognized or secret-bearing diagnostic value %s", (candidate) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    jsonError(
      Object.assign(new Error("private provider message"), {
        code: candidate,
        data: { error: candidate, error_description: "private-description" },
      }),
    );
    const diagnostic = log.mock.calls[0]![1];
    expect(diagnostic).not.toHaveProperty("code");
    expect(diagnostic).not.toHaveProperty("oauthError");
    expect(JSON.stringify(diagnostic)).not.toContain(candidate);
    expect(JSON.stringify(diagnostic)).not.toContain("private-description");
  });

  it("does not coerce objects or execute getters in diagnostic properties", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const getter = vi.fn(() => {
      throw new Error("private getter secret");
    });
    const convert = vi.fn(() => "invalid_client");
    const error = Object.assign(new Error("private provider message"), {
      data: { error: { toString: convert } },
    });
    Object.defineProperty(error, "code", { get: getter });
    expect(() => jsonError(error)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![1]).not.toHaveProperty("code");
    expect(log.mock.calls[0]![1]).not.toHaveProperty("oauthError");
  });

  it("retains an allowed cause code while omitting its sensitive response details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("private response body"), {
      code: "ERR_JWKS_TIMEOUT",
      data: { error: "invalid_scope", body: "private-body" },
    });
    jsonError(new Error("safe outer context", { cause }));
    expect(log.mock.calls[0]![1]).toMatchObject({
      cause: { code: "ERR_JWKS_TIMEOUT", oauthError: "invalid_scope" },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-body");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private response body");
  });
});

describe("same-origin writes", () => {
  it("accepts the configured origin and rejects absent, sibling and cross-site origins", () => {
    const request = (origin?: string) =>
      new Request("https://account.example.com/api/checkout", {
        method: "POST",
        headers: origin ? { origin } : {},
      });
    expect(() =>
      requireSameOrigin(request("https://account.example.com"), "https://account.example.com"),
    ).not.toThrow();
    for (const origin of [
      undefined,
      "https://example.com",
      "https://account.example.com.evil.test",
      "null",
    ]) {
      expect(() => requireSameOrigin(request(origin), "https://account.example.com")).toThrow(
        ApiError,
      );
    }
  });

  it("allows HTTP only for local development", () => {
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3001", { headers: { origin: "http://localhost:3001" } }),
        "http://localhost:3001",
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOrigin(
        new Request("http://account.example.com", {
          headers: { origin: "http://account.example.com" },
        }),
        "http://account.example.com",
      ),
    ).toThrow(ApiError);
  });
});
