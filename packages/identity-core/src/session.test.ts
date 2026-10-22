import { CookieStorage, PersistKey } from "@logto/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LogtoSessionClient, { getLogtoContext, sessionCookieName } from "./session";

type CookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};
type Adapter = {
  storage: CookieStorage;
  navigate: (url: string) => unknown;
};

const sdk = vi.hoisted(() => ({
  construct: vi.fn(),
  signIn: vi.fn(),
  callback: vi.fn(),
  signOut: vi.fn(),
  context: vi.fn(),
}));
const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@logto/node/edge", () => ({
  default: class {
    constructor(
      config: unknown,
      private adapter: Adapter,
    ) {
      sdk.construct(config, adapter);
    }
    signIn(options: unknown) {
      return sdk.signIn(options, this.adapter);
    }
    handleSignInCallback(url: string) {
      return sdk.callback(url, this.adapter);
    }
    signOut(returnTo: string) {
      return sdk.signOut(returnTo, this.adapter);
    }
    getContext(options?: unknown) {
      return sdk.context(this.adapter, options);
    }
  },
}));

const config = {
  appId: "fixture_app",
  appSecret: "fixture-client-secret",
  endpoint: "https://fixture.logto.app",
  baseUrl: "https://login.loom-labs.ai",
  cookieSecret: "fixture-cookie-key-at-least-32-characters-long",
  cookieSecure: true,
  cookieDomain: ".loom-labs.ai",
};
const cookies = new Map<string, string>();
const expectedCookieOptions = {
  domain: ".loom-labs.ai",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

async function seedCookie(name: string, token = "fixture-id-token", key = config.cookieSecret) {
  const storage = new CookieStorage({
    cookieKey: name,
    encryptionKey: key,
    isSecure: true,
    getCookie: () => undefined,
    setCookie: (cookieName, value) => void cookies.set(cookieName, value),
  });
  await storage.init();
  await storage.setItem(PersistKey.IdToken, token);
}

beforeEach(() => {
  vi.resetAllMocks();
  cookies.clear();
  cookieStore.get.mockImplementation((name: string) => {
    const value = cookies.get(name);
    return value === undefined ? undefined : { name, value };
  });
  cookieStore.set.mockImplementation((name: string, value: string, options: CookieOptions) => {
    if (options.maxAge === 0) cookies.delete(name);
    else cookies.set(name, value);
  });
  sdk.signIn.mockImplementation(async (_options: unknown, adapter: Adapter) => {
    await adapter.storage.setItem(PersistKey.SignInSession, "fixture-state-and-pkce");
    await adapter.navigate("https://fixture.logto.app/oidc/auth");
  });
  sdk.callback.mockImplementation(async (_url: string, adapter: Adapter) => {
    await adapter.storage.setItem(PersistKey.IdToken, "fixture-id-token");
    await adapter.navigate("https://www.loom-labs.ai/workspace?view=demo");
  });
  sdk.signOut.mockImplementation(async (_returnTo: string, adapter: Adapter) => {
    await adapter.navigate("https://fixture.logto.app/oidc/session/end");
  });
  sdk.context.mockImplementation(async (adapter: Adapter) => {
    const token = await adapter.storage.getItem(PersistKey.IdToken);
    return token
      ? { isAuthenticated: true, claims: { sub: "fixture-user", exp: 2_000_000_000 } }
      : { isAuthenticated: false };
  });
});

describe("shared Logto session cookie", () => {
  it("uses a distinct secure name and delegates sign-in with real encrypted parent-domain storage", async () => {
    expect(sessionCookieName(config)).toBe("__Secure-loom_session_fixture_app");
    const options = {
      redirectUri: "https://login.loom-labs.ai/api/auth/callback",
      postRedirectUri: "https://www.loom-labs.ai/workspace?view=demo",
      directSignIn: { method: "social" as const, target: "github" },
    };
    const result = await new LogtoSessionClient(config).handleSignIn(options);
    expect(result).toEqual({ url: "https://fixture.logto.app/oidc/auth" });
    expect(sdk.signIn).toHaveBeenCalledWith(options, expect.any(Object));
    expect(sdk.construct.mock.calls[0]?.[1].storage).toBeInstanceOf(CookieStorage);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "__Secure-loom_session_fixture_app",
      expect.any(String),
      expect.objectContaining(expectedCookieOptions),
    );
    expect(cookies.get("__Secure-loom_session_fixture_app")).not.toContain("fixture-state");

    const adapter = sdk.construct.mock.calls[0]?.[1] as Adapter;
    expect(await adapter.storage.getItem(PersistKey.SignInSession)).toBe("fixture-state-and-pkce");
  });

  it("uses a host-only development cookie without the Secure prefix", async () => {
    const local = { ...config, baseUrl: "http://localhost:3001", cookieSecure: false };
    delete (local as { cookieDomain?: string }).cookieDomain;
    expect(sessionCookieName(local)).toBe("loom_session_fixture_app");
    await new LogtoSessionClient(local).handleSignIn({
      redirectUri: "http://localhost:3001/api/auth/callback",
    });
    expect(cookieStore.set).toHaveBeenCalledWith(
      "loom_session_fixture_app",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: false, path: "/", sameSite: "lax" }),
    );
    expect(cookieStore.set.mock.calls.at(-1)?.[2].domain).toBeUndefined();
  });

  it("delegates callback validation and persists the returned session with the shared domain", async () => {
    const callback = "https://login.loom-labs.ai/api/auth/callback?code=fixture&state=fixture";
    const result = await new LogtoSessionClient(config).handleSignInCallback(callback);
    expect(result).toBe("https://www.loom-labs.ai/workspace?view=demo");
    expect(sdk.callback).toHaveBeenCalledWith(callback, expect.any(Object));
    expect(cookieStore.set).toHaveBeenCalledWith(
      "__Secure-loom_session_fixture_app",
      expect.any(String),
      expect.objectContaining(expectedCookieOptions),
    );
    expect(await getLogtoContext(config)).toMatchObject({
      isAuthenticated: true,
      claims: { sub: "fixture-user" },
    });
  });

  it("reads the same parent-domain session from a sibling product with the same key", async () => {
    await seedCookie(sessionCookieName(config));
    const sibling = { ...config, baseUrl: "https://checkout.loom-labs.ai" };
    expect(await new LogtoSessionClient(sibling).getContext()).toMatchObject({
      isAuthenticated: true,
      claims: { sub: "fixture-user" },
    });
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(
      await getLogtoContext({
        ...sibling,
        cookieSecret: "other-fixture-key-at-least-32-characters",
      }),
    ).toEqual({
      isAuthenticated: false,
    });
  });

  it("ignores the previous SDK host-only cookie even when it contains a valid encrypted identity", async () => {
    await seedCookie("logto_fixture_app");
    expect(await getLogtoContext(config)).toEqual({ isAuthenticated: false });
    expect(cookieStore.get).not.toHaveBeenCalledWith("logto_fixture_app");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not write cookies while reading context, even if the SDK attempts a storage change", async () => {
    await seedCookie(sessionCookieName(config));
    sdk.context.mockImplementationOnce(async (adapter: Adapter) => {
      await adapter.storage.setItem(PersistKey.IdToken, "fixture-refreshed-token");
      return { isAuthenticated: true, claims: { sub: "fixture-user", exp: 2_000_000_000 } };
    });
    expect(await getLogtoContext(config)).toMatchObject({ isAuthenticated: true });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "clears shared and legacy host-only cookies when SDK sign-out fails=%s",
    async (fails) => {
      await seedCookie(sessionCookieName(config));
      await seedCookie("logto_fixture_app");
      if (fails) sdk.signOut.mockRejectedValueOnce(new Error("fixture logout failure"));
      const signOut = new LogtoSessionClient(config).handleSignOut("https://login.loom-labs.ai/");
      if (fails) await expect(signOut).rejects.toThrow("fixture logout failure");
      else await expect(signOut).resolves.toBe("https://fixture.logto.app/oidc/session/end");
      expect(sdk.signOut).toHaveBeenCalledWith("https://login.loom-labs.ai/", expect.any(Object));
      expect(cookieStore.set).toHaveBeenCalledWith(
        sessionCookieName(config),
        "",
        expect.objectContaining({ ...expectedCookieOptions, maxAge: 0 }),
      );
      expect(cookieStore.set).toHaveBeenCalledWith(
        "logto_fixture_app",
        "",
        expect.objectContaining({ path: "/", maxAge: 0 }),
      );
      const oldCookieDeletion = cookieStore.set.mock.calls.find(
        ([name]) => name === "logto_fixture_app",
      );
      expect(oldCookieDeletion?.[2].domain).toBeUndefined();
      expect(await getLogtoContext(config)).toEqual({ isAuthenticated: false });
    },
  );

  it("propagates SDK callback rejection without manufacturing an authenticated cookie", async () => {
    sdk.callback.mockRejectedValueOnce(new Error("fixture invalid state"));
    await expect(
      new LogtoSessionClient(config).handleSignInCallback(
        "https://login.loom-labs.ai/api/auth/callback",
      ),
    ).rejects.toThrow("fixture invalid state");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("rejects sign-in when the SDK does not provide its authorization destination", async () => {
    sdk.signIn.mockResolvedValueOnce(undefined);
    await expect(
      new LogtoSessionClient(config).handleSignIn({
        redirectUri: "https://login.loom-labs.ai/api/auth/callback",
      }),
    ).rejects.toThrow("Missing SDK sign-in navigation");
  });

  it("allows a verified callback with no post-sign-in destination", async () => {
    sdk.callback.mockResolvedValueOnce(undefined);
    await expect(
      new LogtoSessionClient(config).handleSignInCallback(
        "https://login.loom-labs.ai/api/auth/callback?code=fixture&state=fixture",
      ),
    ).resolves.toBeUndefined();
  });

  it("still clears the shared cookie when sign-out has no navigation destination", async () => {
    await seedCookie(sessionCookieName(config));
    sdk.signOut.mockResolvedValueOnce(undefined);
    await expect(
      new LogtoSessionClient(config).handleSignOut("https://login.loom-labs.ai/"),
    ).rejects.toThrow("Missing SDK sign-out navigation");
    expect(cookieStore.set).toHaveBeenCalledWith(
      sessionCookieName(config),
      "",
      expect.objectContaining({ ...expectedCookieOptions, maxAge: 0 }),
    );
    expect(await getLogtoContext(config)).toEqual({ isAuthenticated: false });
  });
});
