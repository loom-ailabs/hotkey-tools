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

vi.mock("./session", () => ({
  default: class {
    handleSignIn = mocks.signIn;
    handleSignInCallback = mocks.callback;
    handleSignOut = mocks.signOut;
  },
  getLogtoContext: mocks.getContext,
}));

import { createAuthService } from "./auth";
import { createAuthRoutes } from "./auth-routes";
const { getLoginPageConfig, getLogtoConfig, getUser, getAuthClient } = createAuthService({
  getEnv: mocks.getEnv,
  getDatabase: mocks.getDatabase,
});
const { login } = createAuthRoutes({
  getAuthClient,
  getEnv: mocks.getEnv,
  getUser,
});

const configuredEnv = {
  APP_URL: "https://checkout.loom-labs.ai",
  LOGIN_URL: "https://login.loom-labs.ai",
  LOGTO_COOKIE_DOMAIN: ".loom-labs.ai",
  AUTH_SUCCESS_URL: "https://www.loom-labs.ai/",
  LOGTO_ENDPOINT: "https://identity.example.com/",
  LOGTO_APP_ID: "app-id",
  LOGTO_APP_SECRET: "test-app-secret",
  LOGTO_COOKIE_SECRET: "a-test-cookie-secret-with-at-least-32-characters",
};

const loginRequest = (query = "", origin = configuredEnv.LOGIN_URL) =>
  new Request(`${origin}/api/auth/login${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getEnv.mockResolvedValue({ ...configuredEnv });
  mocks.getContext.mockResolvedValue({ isAuthenticated: false });
  mocks.getDatabase.mockResolvedValue({ prepare: vi.fn() });
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
      websiteAppUrl: "https://checkout.example.com",
    });
    mocks.getEnv.mockResolvedValue({
      APP_URL: "http://localhost:3001",
      LOGIN_URL: "http://localhost:3002",
    });
    expect(await getLoginPageConfig()).toEqual({
      appUrl: "http://localhost:3001",
      loginUrl: "http://localhost:3002",
      websiteAppUrl: "http://localhost:3001",
    });
  });

  it("uses only the configured website origin for login portal links", async () => {
    mocks.getEnv.mockResolvedValue({
      APP_URL: "https://checkout.example.com",
      LOGIN_URL: "https://login.example.com",
      AUTH_SUCCESS_URL: "https://www.loom-labs.ai/",
    });
    expect(await getLoginPageConfig()).toEqual({
      appUrl: "https://checkout.example.com",
      loginUrl: "https://login.example.com",
      websiteAppUrl: "https://www.loom-labs.ai",
    });
    for (const AUTH_SUCCESS_URL of [
      "https://www.loom-labs.ai/path",
      "https://www.loom-labs.ai/?returnTo=evil",
      "https://evil:secret@www.example.com/",
      "http://www.example.com",
    ]) {
      mocks.getEnv.mockResolvedValue({
        APP_URL: "https://checkout.example.com",
        LOGIN_URL: "https://login.example.com",
        AUTH_SUCCESS_URL,
      });
      await expect(getLoginPageConfig()).rejects.toMatchObject({ status: 503 });
    }
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
      { APP_URL: "https://checkout.loom-labs.ai/other" },
      { AUTH_SUCCESS_URL: "http://www.example.com/" },
      { AUTH_SUCCESS_URL: "https://www.loom-labs.ai/path" },
      { AUTH_SUCCESS_URL: "https://user:secret@www.example.com/" },
      { AUTH_SUCCESS_URL: "https://www.loom-labs.ai/?next=other" },
      { AUTH_SUCCESS_URL: "https://www.loom-labs.ai/#fragment" },
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
    mocks.getEnv.mockResolvedValue({
      ...configuredEnv,
      APP_URL: "http://localhost:3001",
      LOGIN_URL: "http://localhost:3001",
      LOGTO_COOKIE_DOMAIN: undefined,
    });
    expect(await getLogtoConfig()).toMatchObject({ cookieSecure: false });
  });

  it("does not update user records for a signed-out request", async () => {
    expect(await getUser()).toBeNull();
    expect((await mocks.getDatabase()).prepare).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed and expired claim timestamps before updating users", async () => {
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
    expect((await mocks.getDatabase()).prepare).not.toHaveBeenCalled();
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
    expect(mocks.getDatabase).toHaveBeenCalledTimes(2);
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
    expect(mocks.getContext).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));
  });
});
