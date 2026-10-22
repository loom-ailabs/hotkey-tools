// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  hasPremium: vi.fn(),
  getEnv: vi.fn(),
  getDatabase: vi.fn(),
  signIn: vi.fn(),
  callback: vi.fn(),
  signOut: vi.fn(),
  getAuthClient: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ getUser: mocks.getUser, getAuthClient: mocks.getAuthClient }));
vi.mock("@/server/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/entitlements", () => ({ hasPremium: mocks.hasPremium }));
import { GET as me } from "./me/route";
import { GET as premium } from "./premium/route";
import { GET as health } from "./health/route";
import { GET as login } from "./auth/login/route";
import { GET as callback } from "./auth/callback/route";
import { POST as logout } from "./auth/logout/route";

const origin = "https://www.loom-labs.ai";
const user = { id: "verified-logto-sub", name: "Example" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getUser.mockResolvedValue(null);
  mocks.hasPremium.mockResolvedValue(false);
  mocks.getEnv.mockResolvedValue({ APP_URL: origin });
  mocks.getDatabase.mockResolvedValue({ prepare: () => ({ first: async () => null }) });
  mocks.getAuthClient.mockResolvedValue({
    config: { baseUrl: "https://login.loom-labs.ai", endpoint: "https://auth.loom-labs.ai" },
    successUrl: `${origin}/`,
    client: {
      handleSignIn: mocks.signIn,
      handleSignInCallback: mocks.callback,
      handleSignOut: mocks.signOut,
    },
  });
  mocks.signIn.mockResolvedValue({ url: "https://auth.loom-labs.ai/oidc/auth" });
  mocks.callback.mockResolvedValue(`${origin}/`);
  mocks.signOut.mockResolvedValue("https://auth.loom-labs.ai/oidc/session/end");
});
afterEach(() => vi.restoreAllMocks());

async function data(response: Response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  return response.json();
}

describe("WWW shared session and current D1 entitlement API", () => {
  it("reports an anonymous profile and refuses premium without reading grants", async () => {
    expect(await data(await me())).toEqual({
      code: 0,
      msg: "success",
      data: { user: null, entitlements: { premium: false } },
    });
    expect(await data(await premium(), 401)).toMatchObject({
      code: 2002,
      error: { type: "unauthenticated" },
    });
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("uses only the verified subject and observes a refund on the next operation", async () => {
    mocks.getUser.mockResolvedValue(user);
    mocks.hasPremium.mockResolvedValue(true);
    expect(await data(await me())).toEqual({
      code: 0,
      msg: "success",
      data: { user, entitlements: { premium: true } },
    });
    expect(await data(await premium())).toMatchObject({
      code: 0,
      data: { unlocked: true, message: expect.stringContaining("演示") },
    });
    expect(mocks.hasPremium).toHaveBeenLastCalledWith(user.id);
    mocks.hasPremium.mockResolvedValue(false);
    expect(await data(await premium(), 403)).toMatchObject({
      code: 2003,
      error: { type: "premium_required" },
    });
  });

  it("fails closed for SDK, entitlement and health database failures", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("secret-provider-payload"));
    expect(JSON.stringify(await data(await me(), 503))).not.toContain("secret-provider-payload");
    mocks.getUser.mockResolvedValue(user);
    mocks.hasPremium.mockRejectedValue(new Error("private-sql"));
    expect(await data(await me(), 503)).toMatchObject({ error: { type: "service_unavailable" } });
    expect(await data(await premium(), 503)).toMatchObject({
      error: { type: "service_unavailable" },
    });
    mocks.getDatabase.mockRejectedValue(new Error("private-db"));
    expect(await data(await health(), 503)).toMatchObject({
      error: { type: "service_unavailable" },
    });
  });

  it("checks the actual users table for health", async () => {
    expect(await data(await health())).toEqual({
      code: 0,
      msg: "success",
      data: { status: "ok", framework: "nextjs", storage: "d1" },
    });
  });
});

describe("WWW callback and logout adapters", () => {
  it.each(["google", "github"])(
    "sends %s requests to central without creating a WWW preauth cookie",
    async (provider) => {
      const destination = `${origin}/pricing?source=product&plan=pro`;
      const response = await login(
        new Request(
          `${origin}/api/auth/login?provider=${provider}&returnTo=${encodeURIComponent(destination)}`,
        ),
      );
      expect(response.status).toBe(303);
      const target = new URL(response.headers.get("location")!);
      expect(target.origin).toBe("https://login.loom-labs.ai");
      expect(target.searchParams.get("returnTo")).toBe(destination);
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(response.headers.has("set-cookie")).toBe(false);
      const completed = await callback(new Request(`${origin}/api/auth/callback?code=fixture`));
      expect(completed.status).toBe(400);
      expect(mocks.callback).not.toHaveBeenCalled();
    },
  );

  it("rejects sibling-domain logout and requires the WWW Origin", async () => {
    const request = (source: string | null) =>
      new Request(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: source ? { origin: source } : {},
      });
    for (const source of [null, "https://checkout.loom-labs.ai", "https://login.loom-labs.ai"]) {
      expect(await data(await logout(request(source)), 403)).toMatchObject({
        error: { type: "invalid_origin" },
      });
    }
    expect(mocks.signOut).not.toHaveBeenCalled();
    const response = await logout(request(origin));
    expect(response.status).toBe(303);
    expect(mocks.signOut).toHaveBeenCalledWith(`${origin}/`);
  });
});
