import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LogtoSessionClient, { flowCookieName, getLogtoContext, sessionCookieName } from "./session";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  signOut: vi.fn(),
  context: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.get, set: mocks.set })),
}));
vi.mock("./session-manager", () => ({
  SessionManager: class {
    constructor(...args: unknown[]) {
      mocks.construct(...args);
    }
    start = mocks.start;
    complete = mocks.complete;
    signOut = mocks.signOut;
    context = mocks.context;
  },
}));
const now = 1_800_000_000_000;
const sid = "s".repeat(43),
  flow = "f".repeat(43);
const db = {} as D1Database;
const config = {
  appId: "fixture_app",
  appSecret: "fixture-secret",
  endpoint: "https://fixture.logto.app",
  baseUrl: "https://login.loom-labs.ai",
  cookieSecret: "fixture-key-at-least-thirty-two-characters",
  cookieSecure: true,
  cookieDomain: ".loom-labs.ai",
};
const cookieOptions = {
  domain: ".loom-labs.ai",
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
};
const options = {
  redirectUri: `${config.baseUrl}/api/auth/callback`,
  postRedirectUri: "https://www.loom-labs.ai/workspace?a=1",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.start.mockResolvedValue({
    url: "https://fixture.logto.app/oidc/auth",
    flow: { id: flow, expiresAt: now + 600_000 },
  });
  mocks.complete.mockResolvedValue({
    returnedUrl: options.postRedirectUri,
    session: { id: sid, expiresAt: now + 14 * 86_400_000 },
  });
  mocks.signOut.mockResolvedValue("https://fixture.logto.app/oidc/session/end");
  mocks.context.mockResolvedValue({ isAuthenticated: false });
  mocks.get.mockImplementation((name: string) => ({
    value: name.includes("loom_sid_") ? sid : name.includes("loom_flow_") ? flow : "obsolete-jwt",
  }));
});
afterEach(() => vi.useRealTimers());

describe("opaque shared session cookie transport", () => {
  it("starts a ten-minute flow without replacing an existing shared auth cookie", async () => {
    expect(sessionCookieName(config)).toBe("__Secure-loom_sid_fixture_app");
    expect(flowCookieName(config)).toBe("__Secure-loom_flow_fixture_app");
    expect(await new LogtoSessionClient(config, db).handleSignIn(options)).toEqual({
      url: "https://fixture.logto.app/oidc/auth",
    });
    expect(mocks.construct).toHaveBeenCalledWith(config, db);
    expect(mocks.start).toHaveBeenCalledWith(options, flow);
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith(flowCookieName(config), flow, {
      ...cookieOptions,
      expires: new Date(now + 600_000),
      maxAge: 600,
    });
  });
  it("writes only a new opaque ID on callback, with an absolute fourteen-day deadline", async () => {
    expect(
      await new LogtoSessionClient(config, db).handleSignInCallback(
        "https://login.loom-labs.ai/api/auth/callback?code=x&state=y",
      ),
    ).toBe(options.postRedirectUri);
    expect(mocks.complete).toHaveBeenCalledWith(flow, expect.stringContaining("code=x"));
    expect(mocks.set).toHaveBeenCalledWith(sessionCookieName(config), sid, {
      ...cookieOptions,
      expires: new Date(now + 14 * 86_400_000),
      maxAge: 1_209_600,
    });
    expect(mocks.set).toHaveBeenCalledWith(flowCookieName(config), "", {
      ...cookieOptions,
      expires: new Date(0),
      maxAge: 0,
    });
  });
  it("expires the flow even when callback validation fails and never writes an auth ID", async () => {
    mocks.get.mockReturnValue(undefined);
    mocks.complete.mockRejectedValueOnce(new Error("invalid state"));
    await expect(
      new LogtoSessionClient(config, db).handleSignInCallback(options.redirectUri),
    ).rejects.toThrow("invalid state");
    expect(mocks.complete).toHaveBeenCalledWith("", options.redirectUri);
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith(
      flowCookieName(config),
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
  it("allows a verified callback with no saved destination", async () => {
    mocks.complete.mockResolvedValueOnce({ session: { id: sid, expiresAt: now + 1000 } });
    expect(
      await new LogtoSessionClient(config, db).handleSignInCallback(options.redirectUri),
    ).toBeUndefined();
  });
  it("uses local host-only cookies with no Secure prefix", async () => {
    const { cookieDomain: _domain, ...rest } = config;
    const local = { ...rest, cookieSecure: false, baseUrl: "http://localhost:3001" };
    expect(sessionCookieName(local)).toBe("loom_sid_fixture_app");
    await new LogtoSessionClient(local, db).handleSignIn(options);
    expect(mocks.set.mock.calls[0]?.[2]).toMatchObject({ secure: false, httpOnly: true });
    expect(mocks.set.mock.calls[0]?.[2]).not.toHaveProperty("domain");
  });
  it("reads the shared ID without reading legacy tokens or setting a cookie during RSC rendering", async () => {
    mocks.context.mockResolvedValueOnce({
      isAuthenticated: true,
      claims: { sub: "u", exp: 2_000_000_000 },
    });
    expect(await getLogtoContext(config, db)).toMatchObject({ isAuthenticated: true });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(sessionCookieName(config));
    expect(mocks.context).toHaveBeenCalledWith(sid);
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.get.mockReturnValue(undefined);
    await getLogtoContext(config, db);
    expect(mocks.context).toHaveBeenLastCalledWith("");
  });
  it.each([false, true])(
    "clears shared, flow and obsolete cookies even if database revocation fails=%s",
    async (failure) => {
      if (failure) mocks.signOut.mockRejectedValueOnce(new Error("db offline"));
      const promise = new LogtoSessionClient(config, db).handleSignOut(config.baseUrl);
      if (failure) await expect(promise).rejects.toThrow("db offline");
      else await expect(promise).resolves.toBe("https://fixture.logto.app/oidc/session/end");
      expect(mocks.signOut).toHaveBeenCalledWith(sid, flow, config.baseUrl);
      for (const name of [
        sessionCookieName(config),
        flowCookieName(config),
        "__Secure-loom_session_fixture_app",
      ])
        expect(mocks.set).toHaveBeenCalledWith(name, "", {
          ...cookieOptions,
          expires: new Date(0),
          maxAge: 0,
        });
      expect(mocks.set).toHaveBeenCalledWith(
        "logto_fixture_app",
        "",
        expect.not.objectContaining({ domain: expect.anything() }),
      );
      mocks.get.mockReturnValue(undefined);
      await new LogtoSessionClient(config, db).handleSignOut(config.baseUrl);
      expect(mocks.signOut).toHaveBeenLastCalledWith("", "", config.baseUrl);
    },
  );
});
