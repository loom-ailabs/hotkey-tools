import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idToken, issuer, protocolFixture, sdkData, sessionConfig } from "../test/session-fixtures";
import { boundedProtocol, hasFreshAccessToken, openSdk, StagedStorage } from "./session-sdk";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("staged SDK storage and public refresh flow", () => {
  let protocol: Awaited<ReturnType<typeof protocolFixture>>;
  beforeEach(async () => {
    protocol = await protocolFixture();
    vi.stubGlobal("fetch", protocol.fetcher);
  });
  afterEach(async () => {
    await protocol.close();
  });

  it("isolates writes from the persisted snapshot until the caller commits", async () => {
    const original = sdkData();
    const storage = new StagedStorage(original);
    expect(await storage.getItem("refreshToken")).toBe("fixture-refresh-old");
    await storage.setItem("refreshToken", "fixture-rotated");
    await storage.removeItem("idToken");
    expect(await storage.getItem("idToken")).toBeNull();
    expect(original.refreshToken).toBe("fixture-refresh-old");
    expect(original.idToken).toEqual(expect.any(String));
    expect(await new StagedStorage().getItem("idToken")).toBeNull();
  });

  it("forces a real SDK refresh with public methods and persists only in its staging area", async () => {
    const original = sdkData({ exp: Math.floor(Date.now() / 1000) - 100 });
    const sdk = openSdk(protocol.config, original);
    await sdk.client.clearAccessToken();
    expect(await sdk.client.getAccessToken()).toBe("fixture-access-new");
    expect(protocol.grants).toHaveLength(1);
    expect(protocol.grants[0]?.get("refresh_token")).toBe("fixture-refresh-old");
    expect(protocol.grants[0]?.get("grant_type")).toBe("refresh_token");
    expect(await sdk.client.getIdTokenClaims()).toMatchObject({
      sub: "fixture-subject",
      iss: issuer,
      aud: sessionConfig.appId,
    });
    expect(await sdk.client.getRefreshToken()).toBe("fixture-refresh-new");
    expect(original.refreshToken).toBe("fixture-refresh-old");
    expect(hasFreshAccessToken(sdk.storage.data, Date.now())).toBe(true);
    expect(sdk.destination()).toBeUndefined();
    expect(protocol.requests.every((request) => request.redirect === "manual")).toBe(true);
    expect(
      protocol.requests.every(
        (request) =>
          request.headers.get("authorization") ===
          `Basic ${Buffer.from(`${sessionConfig.appId}:${sessionConfig.appSecret}`).toString("base64")}`,
      ),
    ).toBe(true);
  });

  it("does not create Basic credentials when no client secret is configured", async () => {
    const sdk = openSdk({ ...protocol.config, appSecret: undefined }, sdkData());
    await sdk.client.clearAccessToken();
    await sdk.client.getAccessToken();
    expect(protocol.requests.every((request) => !request.headers.has("authorization"))).toBe(true);
  });

  it("refuses to send credentials to an external token endpoint from discovery", async () => {
    protocol.setTokenEndpoint("https://attacker.example/token");
    const sdk = openSdk(protocol.config, sdkData());
    await sdk.client.clearAccessToken();
    await expect(sdk.client.getAccessToken()).rejects.toThrow("Untrusted identity endpoint");
    expect(protocol.grants).toHaveLength(0);
    expect(
      protocol.requests.every(
        (request) => new URL(request.url).hostname === "session-fixture.logto.test",
      ),
    ).toBe(true);
  });

  it.each([300, 301, 302, 303, 304, 307, 308, 399])(
    "rejects token endpoint redirect %s without forwarding its body or credentials",
    async (status) => {
      protocol.respond(
        async () =>
          new Response(null, { status, headers: { Location: "https://attacker.example/token" } }),
      );
      const sdk = openSdk(protocol.config, sdkData());
      await sdk.client.clearAccessToken();
      await expect(sdk.client.getAccessToken()).rejects.toThrow(
        "Unexpected authentication redirect",
      );
      expect(protocol.grants).toHaveLength(1);
      expect(
        protocol.requests.every(
          (request) =>
            request.redirect === "manual" &&
            new URL(request.url).hostname === "session-fixture.logto.test",
        ),
      ).toBe(true);
    },
  );

  it.each([400, 429, 500])(
    "keeps provider error bodies out of SDK logs for status %s",
    async (status) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      protocol.respond(async () =>
        Response.json(
          {
            error: "invalid_grant",
            error_description: "fixture-sensitive-provider-response",
            refresh_token: "fixture-secret-response-token",
          },
          { status },
        ),
      );
      const sdk = openSdk(protocol.config, sdkData());
      await sdk.client.clearAccessToken();
      await expect(sdk.client.getAccessToken()).rejects.toMatchObject({
        code: status === 429 ? "rate_limited" : `http_error_${status}`,
      });
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("Authentication request failed");
      expect(logged).not.toContain("fixture-sensitive-provider-response");
      expect(logged).not.toContain("fixture-secret-response-token");
    },
  );

  it.each(["issuer", "audience", "signature", "expired"])(
    "uses official SDK cryptographic verification to reject a bad %s",
    async (invalid) => {
      const claims =
        invalid === "issuer"
          ? { iss: "https://attacker.example" }
          : invalid === "audience"
            ? { aud: "other-app" }
            : invalid === "expired"
              ? { exp: Math.floor(Date.now() / 1000) - 3600 }
              : {};
      protocol.respond(async () =>
        Response.json({
          access_token: "fixture-access-new",
          refresh_token: "fixture-refresh-new",
          id_token: idToken(claims, invalid === "signature"),
          expires_in: 3600,
        }),
      );
      const sdk = openSdk(protocol.config, sdkData());
      await sdk.client.clearAccessToken();
      await expect(sdk.client.getAccessToken()).rejects.toThrow();
      expect(protocol.grants).toHaveLength(1);
    },
  );

  it.each([
    undefined,
    "{",
    "null",
    "{}",
    JSON.stringify({ "@": { token: 3, expiresAt: Date.now() / 1000 + 3600 } }),
    JSON.stringify({ "@": { token: "fixture", expiresAt: Date.now() / 1000 + 60 } }),
  ])("rejects missing, malformed or near-expiry access-token cache: %s", (accessToken) => {
    expect(hasFreshAccessToken(accessToken === undefined ? {} : { accessToken }, Date.now())).toBe(
      false,
    );
  });

  it("bounds protocol work and clears its timer on success, rejection and timeout", async () => {
    vi.useFakeTimers();
    expect(await boundedProtocol(Promise.resolve("done"))).toBe("done");
    await expect(boundedProtocol(Promise.reject(new Error("fixture failure")))).rejects.toThrow(
      "fixture failure",
    );
    const pending = expect(boundedProtocol(new Promise(() => {}))).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});
