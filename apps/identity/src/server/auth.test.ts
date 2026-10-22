import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  getDatabase: vi.fn(),
  getContext: vi.fn(),
  signIn: vi.fn(),
  callback: vi.fn(),
  signOut: vi.fn(),
  hasPremium: vi.fn(),
}));

vi.mock("@/server/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/billing", () => ({ hasPremium: mocks.hasPremium }));
vi.mock("@logto/next/server-actions", () => ({
  default: class {
    handleSignIn = mocks.signIn;
    handleSignInCallback = mocks.callback;
    handleSignOut = mocks.signOut;
  },
  getLogtoContext: mocks.getContext,
}));

import { getLoginPageConfig, getLogtoConfig, getUser } from "./auth";
import { SQLiteD1, seedOrder } from "@/test/billing-fixtures";
import { GET as login } from "@/app/api/auth/login/route";
import { GET as callback } from "@/app/api/auth/callback/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/me/route";

const configuredEnv = {
  APP_URL: "https://account.example.com",
  AUTH_SUCCESS_URL: "https://www.example.com/",
  LOGTO_ENDPOINT: "https://identity.example.com/",
  LOGTO_APP_ID: "app-id",
  LOGTO_APP_SECRET: "test-app-secret",
  LOGTO_COOKIE_SECRET: "a-test-cookie-secret-with-at-least-32-characters",
};

const loginRequest = (query = "", origin = configuredEnv.APP_URL) =>
  new Request(`${origin}/api/auth/login${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getEnv.mockResolvedValue({ ...configuredEnv });
  mocks.getContext.mockResolvedValue({ isAuthenticated: false });
  mocks.signIn.mockResolvedValue({ url: "https://identity.example.com/oidc/auth" });
  mocks.callback.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue("https://identity.example.com/oidc/session/end");
  mocks.hasPremium.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Logto configuration and identity", () => {
  it("keeps the default page when a separate login host is not configured", async () => {
    mocks.getEnv.mockResolvedValue({});
    expect(await getLoginPageConfig()).toBeNull();
    mocks.getEnv.mockResolvedValue({ LOGIN_URL: "  " });
    expect(await getLoginPageConfig()).toBeNull();
  });

  it("returns only validated public page origins without needing provider credentials", async () => {
    mocks.getEnv.mockResolvedValue({
      APP_URL: "https://checkout.example.com/",
      LOGIN_URL: "https://login.example.com/",
      LOGTO_APP_SECRET: "must-not-return",
    });
    expect(await getLoginPageConfig()).toEqual({
      appUrl: "https://checkout.example.com",
      loginUrl: "https://login.example.com",
    });
    mocks.getEnv.mockResolvedValue({
      APP_URL: "http://localhost:3001",
      LOGIN_URL: "http://localhost:3002",
    });
    expect(await getLoginPageConfig()).toEqual({
      appUrl: "http://localhost:3001",
      loginUrl: "http://localhost:3002",
    });
  });

  it.each([
    { APP_URL: undefined, LOGIN_URL: "https://login.example.com" },
    { APP_URL: "https://checkout.example.com/other", LOGIN_URL: "https://login.example.com" },
    { APP_URL: "https://checkout.example.com", LOGIN_URL: "http://login.example.com" },
    { APP_URL: "https://checkout.example.com", LOGIN_URL: "https://user:pass@login.example.com" },
    { APP_URL: "https://checkout.example.com", LOGIN_URL: "https://login.example.com?next=evil" },
    { APP_URL: "https://checkout.example.com", LOGIN_URL: "https://login.example.com#fragment" },
  ])("rejects unsafe page origins: %j", async (env) => {
    mocks.getEnv.mockResolvedValue(env);
    await expect(getLoginPageConfig()).rejects.toMatchObject({ status: 503 });
  });

  it("fails closed without exposing configured secrets when configuration is missing", async () => {
    mocks.getEnv.mockResolvedValue({ ...configuredEnv, LOGTO_APP_ID: undefined });
    const response = await login(loginRequest());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(body).toContain("LOGTO_APP_ID");
    expect(body).not.toContain(configuredEnv.LOGTO_APP_SECRET);
    expect(body).not.toContain(configuredEnv.LOGTO_COOKIE_SECRET);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("rejects short cookie keys, non-local HTTP and an APP_URL containing a path", async () => {
    for (const override of [
      { LOGTO_COOKIE_SECRET: "too-short" },
      { APP_URL: "http://account.example.com" },
      { LOGTO_ENDPOINT: "http://identity.example.com" },
      { APP_URL: "https://account.example.com/other" },
      { AUTH_SUCCESS_URL: "http://www.example.com/" },
      { AUTH_SUCCESS_URL: "https://www.example.com/path" },
      { AUTH_SUCCESS_URL: "https://user:secret@www.example.com/" },
      { AUTH_SUCCESS_URL: "https://www.example.com/?next=other" },
      { AUTH_SUCCESS_URL: "https://www.example.com/#fragment" },
      { LOGTO_USER_NAMESPACE: "http://tenant.example.com" },
      { LOGTO_USER_NAMESPACE: "https://user:secret@tenant.example.com" },
      { LOGTO_USER_NAMESPACE: "https://tenant.example.com?user=other" },
    ]) {
      mocks.getEnv.mockResolvedValue({ ...configuredEnv, ...override });
      await expect(getLogtoConfig()).rejects.toMatchObject({ status: 503 });
    }
  });

  it("enables secure production cookies while allowing local HTTP development", async () => {
    expect(await getLogtoConfig()).toMatchObject({
      endpoint: "https://identity.example.com",
      cookieSecure: true,
    });
    mocks.getEnv.mockResolvedValue({ ...configuredEnv, APP_URL: "http://localhost:3001" });
    expect(await getLogtoConfig()).toMatchObject({ cookieSecure: false });
  });

  it("does not access the user database for a signed-out request", async () => {
    expect(await getUser()).toBeNull();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed and expired claim timestamps before accessing storage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00.900Z"));
    const now = Math.floor(Date.now() / 1000);

    for (const exp of [undefined, null, "9999999999", NaN, Infinity, now + 0.5, now - 1, now]) {
      mocks.getContext.mockResolvedValue({
        isAuthenticated: true,
        claims: { sub: "subject-123", exp },
      });
      expect(await getUser()).toBeNull();
    }
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("accepts the final valid second and rejects the same cookie at the expiry boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00.900Z"));
    const exp = Math.floor(Date.now() / 1000) + 1;
    mocks.getContext.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: "subject-123", exp },
    });
    mocks.getDatabase.mockResolvedValue({
      prepare: () => ({ bind: () => ({ run: async () => ({ success: true }) }) }),
    });

    expect(await getUser()).toEqual({ id: "subject-123" });
    expect(mocks.getDatabase).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(100);
    expect(await getUser()).toBeNull();
    expect(mocks.getDatabase).toHaveBeenCalledOnce();
  });

  it("stores the verified subject and issuer rather than using email as the user key", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    mocks.getDatabase.mockResolvedValue({ prepare });
    mocks.getContext.mockResolvedValue({
      isAuthenticated: true,
      claims: {
        sub: "subject-123",
        exp: Math.floor(Date.now() / 1000) + 300,
        name: "A User",
        email: "user@example.com",
      },
    });

    expect(await getUser()).toEqual({
      id: "subject-123",
      name: "A User",
      email: "user@example.com",
    });
    expect(bind).toHaveBeenCalledWith(
      "subject-123",
      "https://identity.example.com",
      "subject-123",
      "A User",
      "user@example.com",
      expect.any(Number),
    );
    expect(run).toHaveBeenCalledOnce();
    expect(mocks.getContext).toHaveBeenCalledWith(expect.any(Object));
  });

  it("keeps existing order ownership when the same tenant adopts a custom endpoint", async () => {
    const database = new SQLiteD1();
    try {
      const order = seedOrder(database);
      mocks.getDatabase.mockResolvedValue(database.binding());
      mocks.getContext.mockResolvedValue({
        isAuthenticated: true,
        claims: { sub: "alice", exp: Math.floor(Date.now() / 1000) + 300 },
      });
      mocks.getEnv.mockResolvedValue({
        ...configuredEnv,
        LOGTO_ENDPOINT: "https://login.example.com",
        LOGTO_USER_NAMESPACE: "https://id.example/",
      });

      expect(await getUser()).toEqual({ id: "alice" });
      expect(mocks.getContext).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: "https://login.example.com" }),
      );
      expect(
        database.raw.prepare("SELECT id, issuer, subject FROM users WHERE id = 'alice'").get(),
      ).toMatchObject({ id: "alice", issuer: "https://id.example", subject: "alice" });
      expect(
        database.raw.prepare("SELECT user_id FROM orders WHERE id = ?").get(order.id),
      ).toMatchObject({ user_id: "alice" });
      expect(
        database.raw.prepare("SELECT COUNT(*) AS count FROM users WHERE id = 'alice'").get(),
      ).toMatchObject({ count: 1 });

      // A forgotten namespace pin must fail rather than silently merge the old
      // subject into a differently configured tenant namespace.
      mocks.getEnv.mockResolvedValue({
        ...configuredEnv,
        LOGTO_ENDPOINT: "https://login.example.com",
      });
      await expect(getUser()).rejects.toThrow(/UNIQUE constraint failed/);
      expect(
        database.raw.prepare("SELECT issuer FROM users WHERE id = 'alice'").get(),
      ).toMatchObject({ issuer: "https://id.example" });
    } finally {
      database.raw.close();
    }
  });
});

describe("authentication routes", () => {
  it("starts login with the configured callback only", async () => {
    const response = await login(loginRequest());
    expect(response.status).toBe(303);
    expect(mocks.signIn).toHaveBeenCalledWith({
      redirectUri: "https://account.example.com/api/auth/callback",
      postRedirectUri: "https://www.example.com/",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("persists only the fixed checkout destination in the SDK sign-in session", async () => {
    await login(loginRequest("?destination=checkout&redirect=https://evil.example.com"));
    expect(mocks.signIn).toHaveBeenCalledWith({
      redirectUri: "https://account.example.com/api/auth/callback",
      postRedirectUri: "https://account.example.com/",
    });
  });

  it.each(["google", "github"])(
    "selects the fixed %s social target and ignores browser-supplied connector identifiers",
    async (provider) => {
      const response = await login(
        loginRequest(`?provider=${provider}&target=attacker-connector&method=sso`),
      );
      expect(response.status).toBe(303);
      expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({
        redirectUri: "https://account.example.com/api/auth/callback",
        postRedirectUri: "https://www.example.com/",
        directSignIn: { method: "social", target: provider },
      });
    },
  );

  it.each([
    "?provider=",
    "?provider=Google",
    "?provider=attacker-connector",
    "?provider=google&provider=github",
  ])("rejects an invalid or repeated provider: %s", async (query) => {
    const response = await login(loginRequest(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { type: "invalid_login_provider" } });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("preserves only the validated provider while canonicalizing an old-host login", async () => {
    const response = await login(
      loginRequest(
        "?provider=github&target=attacker&returnTo=https://evil.example",
        "https://old.example",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://account.example.com/api/auth/login?destination=website&provider=github",
    );
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("redirects an old host to the canonical login before creating a sign-in cookie", async () => {
    const response = await login(
      loginRequest(
        "?destination=checkout&returnTo=https://evil.example.com",
        "https://old.example",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://account.example.com/api/auth/login?destination=checkout",
    );
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each([
    "?destination=evil",
    "?destination=https://evil.example",
    "?destination=website&destination=checkout",
  ])("rejects an invalid or ambiguous destination %s", async (query) => {
    expect((await login(loginRequest(query))).status).toBe(400);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("delegates state and PKCE verification to the SDK and uses its protected website target", async () => {
    mocks.callback.mockResolvedValue("https://www.example.com/");
    const response = await callback(
      new Request(
        "https://account.example.com/api/auth/callback?code=code-value&state=state-value&returnTo=https://evil.example",
      ),
    );
    expect(mocks.callback).toHaveBeenCalledWith(
      "https://account.example.com/api/auth/callback?code=code-value&state=state-value&returnTo=https://evil.example",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.example.com/");
  });

  it("allows the protected checkout target and defaults old sessions to the configured website", async () => {
    mocks.callback.mockResolvedValue("https://account.example.com/");
    expect(
      (await callback(new Request("https://account.example.com/api/auth/callback"))).headers.get(
        "location",
      ),
    ).toBe("https://account.example.com/");
    mocks.callback.mockResolvedValue(undefined);
    expect(
      (await callback(new Request("https://account.example.com/api/auth/callback"))).headers.get(
        "location",
      ),
    ).toBe("https://www.example.com/");
  });

  it("rejects a callback on another host before exchanging its authorization code", async () => {
    const response = await callback(
      new Request("https://old.example/api/auth/callback?code=value"),
    );
    expect(response.status).toBe(400);
    expect(mocks.callback).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example/",
    "https://www.example.com/path",
    "https://www.example.com/?next=evil",
  ])("rejects an SDK return target outside the two fixed roots: %s", async (target) => {
    mocks.callback.mockResolvedValue(target);
    const response = await callback(new Request("https://account.example.com/api/auth/callback"));
    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);
  });

  it("defaults the website target to the canonical root when not configured", async () => {
    mocks.getEnv.mockResolvedValue({ ...configuredEnv, AUTH_SUCCESS_URL: undefined });
    await login(loginRequest("?destination=website"));
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        postRedirectUri: "https://account.example.com/",
      }),
    );
  });

  it("never completes a callback after SDK verification fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.callback.mockRejectedValue(new Error("invalid-state secret-do-not-expose"));
    const response = await callback(new Request("https://account.example.com/api/auth/callback"));
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("secret-do-not-expose");
    log.mockRestore();
  });

  it("rejects cross-site logout before touching the session and changes POST redirects to GET", async () => {
    const blocked = await logout(
      new Request("https://account.example.com/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example.com" },
      }),
    );
    expect(blocked.status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();

    const response = await logout(
      new Request("https://account.example.com/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://account.example.com" },
      }),
    );
    expect(response.status).toBe(303);
    expect(mocks.signOut).toHaveBeenCalledWith("https://account.example.com/");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("current user endpoint", () => {
  it("returns an uncached signed-out state without querying entitlements", async () => {
    const response = await me();
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: { user: null, entitlements: { premium: false } },
    });
    expect(mocks.hasPremium).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("queries entitlement ownership using only the authenticated subject", async () => {
    mocks.getContext.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: "owner-subject", exp: Math.floor(Date.now() / 1000) + 300 },
    });
    mocks.getDatabase.mockResolvedValue({
      prepare: () => ({ bind: () => ({ run: async () => ({ success: true }) }) }),
    });
    mocks.hasPremium.mockResolvedValue(true);

    const response = await me();
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: {
        user: { id: "owner-subject" },
        entitlements: { premium: true },
      },
    });
    expect(mocks.hasPremium).toHaveBeenCalledWith("owner-subject");
  });
});
