import { beforeEach, expect, it, vi } from "vitest";
import { createAuthRoutes, resolveLoginReturnTarget } from "./auth-routes";
const origin = "https://login.loom-labs.ai";
const product = "https://www.loom-labs.ai/workspace?source=sso-check";
const signIn = vi.fn(),
  callback = vi.fn(),
  signOut = vi.fn(),
  getUser = vi.fn();
const config = {
  appId: "fixture",
  appSecret: "fixture",
  endpoint: "https://auth.loom-labs.ai",
  baseUrl: origin,
  cookieSecret: "fixture-key-with-thirty-two-characters",
  cookieSecure: true,
  cookieDomain: ".loom-labs.ai",
};
const env = {
  APP_URL: "https://checkout.loom-labs.ai",
  AUTH_SUCCESS_URL: "https://www.loom-labs.ai/",
  LOGIN_URL: origin,
};
const getAuthClient = vi.fn();
const getEnv = vi.fn();
const routes = createAuthRoutes({ getAuthClient, getEnv, getUser });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getEnv.mockResolvedValue(env);
  getUser.mockResolvedValue(null);
  getAuthClient.mockResolvedValue({
    config,
    successUrl: env.AUTH_SUCCESS_URL,
    client: { handleSignIn: signIn, handleSignInCallback: callback, handleSignOut: signOut },
  });
  signIn.mockResolvedValue({ url: "https://auth.loom-labs.ai/oidc/auth" });
  callback.mockResolvedValue(product);
  signOut.mockResolvedValue("https://auth.loom-labs.ai/oidc/session/end");
});
const request = (query = "", host = origin) => new Request(`${host}/api/auth/login${query}`);
const encoded = `?returnTo=${encodeURIComponent(product)}`;
it("routes products through the central login page before starting OIDC", async () => {
  const response = await routes.login(
    request(encoded + "&provider=google", "https://www.loom-labs.ai"),
  );
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location")!).origin).toBe(origin);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  expect(new URL(response.headers.get("location")!).searchParams.get("returnTo")).toBe(product);
  expect(signIn).not.toHaveBeenCalled();
  expect(response.headers.has("set-cookie")).toBe(false);
});
it("returns an already authenticated shared session directly to the validated product path", async () => {
  getUser.mockResolvedValue({ id: "verified-sub" });
  const response = await routes.login(request(encoded));
  expect(response.headers.get("location")).toBe(product);
  expect(response.status).toBe(303);
  expect(signIn).not.toHaveBeenCalled();
});
it.each(["google", "github"])(
  "stores the fixed %s provider and validated target inside the SDK session",
  async (provider) => {
    const response = await routes.login(
      request(encoded + `&provider=${provider}&target=attacker&method=sso`),
    );
    expect(response.status).toBe(303);
    expect(signIn).toHaveBeenCalledWith({
      redirectUri: `${origin}/api/auth/callback`,
      postRedirectUri: product,
      extraParams: { ui_locales: "en" },
      directSignIn: { method: "social", target: provider },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  },
);
it("defaults to the website workspace and supports the fixed legacy checkout target", async () => {
  await routes.login(request());
  expect(signIn).toHaveBeenLastCalledWith({
    redirectUri: `${origin}/api/auth/callback`,
    postRedirectUri: "https://www.loom-labs.ai/workspace",
    extraParams: { ui_locales: "en" },
  });
  await routes.login(request("?destination=checkout"));
  expect(signIn).toHaveBeenLastCalledWith({
    redirectUri: `${origin}/api/auth/callback`,
    postRedirectUri: "https://checkout.loom-labs.ai/",
    extraParams: { ui_locales: "en" },
  });
});

it("maps the validated English preference to the official SDK ui_locales parameter", async () => {
  await routes.login(
    new Request(`${origin}/api/auth/login?provider=github`, {
      headers: { cookie: "unrelated=1; LOOM_LOCALE=en" },
    }),
  );
  expect(signIn).toHaveBeenLastCalledWith(
    expect.objectContaining({ extraParams: { ui_locales: "en" } }),
  );
});
it("preserves an explicit Chinese preference for the official hosted login", async () => {
  await routes.login(
    new Request(`${origin}/api/auth/login?provider=github`, {
      headers: { cookie: "LOOM_LOCALE=zh" },
    }),
  );
  expect(signIn).toHaveBeenCalledWith(
    expect.objectContaining({ extraParams: { ui_locales: "zh-CN" } }),
  );
});

it.each(["", "LOOM_LOCALE=fr", "LOOM_LOCALE=%65n", "LOOM_LOCALE=en; LOOM_LOCALE=zh"])(
  "does not forward arbitrary or ambiguous locale input: %s",
  async (cookie) => {
    await routes.login(
      new Request(`${origin}/api/auth/login?ui_locales=attacker&extraParams=attacker`, {
        headers: { cookie },
      }),
    );
    expect(signIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ extraParams: { ui_locales: "en" } }),
    );
  },
);
it.each(["light", "dark"])(
  "keeps the selected %s appearance for the hosted authentication flow",
  async (theme) => {
    await routes.login(
      new Request(`${origin}/api/auth/login?provider=google&theme=attacker`, {
        headers: { cookie: `unrelated=1; LOOM_THEME=${theme}; LOOM_LOCALE=zh` },
      }),
    );
    expect(signIn).toHaveBeenLastCalledWith({
      redirectUri: `${origin}/api/auth/callback`,
      postRedirectUri: "https://www.loom-labs.ai/workspace",
      extraParams: { ui_locales: "zh-CN", theme },
      directSignIn: { method: "social", target: "google" },
    });
  },
);
it.each([
  "",
  "LOOM_THEME=system",
  "LOOM_THEME=",
  "LOOM_THEME=Dark",
  "LOOM_THEME=attacker",
  "LOOM_THEME=%64ark",
  "LOOM_THEME=light; LOOM_THEME=dark",
  "LOOM_THEME=dark; LOOM_THEME=dark",
])("omits uncertain appearance overrides and ignores query theme: %s", async (cookie) => {
  await routes.login(
    new Request(`${origin}/api/auth/login?theme=dark&theme=light`, { headers: { cookie } }),
  );
  expect(signIn).toHaveBeenLastCalledWith(
    expect.objectContaining({ extraParams: { ui_locales: "en" } }),
  );
});
it.each([
  "?provider=",
  "?provider=Google",
  "?provider=evil",
  "?provider=github&provider=google",
  "?destination=evil",
  "?destination=website&destination=checkout",
  "?returnTo=https://www.loom-labs.ai/&returnTo=https://other.loom-labs.ai/",
  "?returnTo=https://evil.example/",
  "?returnTo=https://www.loom-labs.ai/%23data#route",
])("rejects malformed/ambiguous auth inputs before mutating cookies: %s", async (query) => {
  expect((await routes.login(request(query))).status).toBe(400);
  expect(signIn).not.toHaveBeenCalled();
});
it("accepts only the SDK-protected callback target and ignores callback returnTo", async () => {
  const response = await routes.callback(
    new Request(
      `${origin}/api/auth/callback?code=fixture&state=fixture&returnTo=https://evil.example/`,
    ),
  );
  expect(callback).toHaveBeenCalledOnce();
  expect(response.headers.get("location")).toBe(product);
});
it("rejects wrong-host callbacks before exchanging a code", async () => {
  expect(
    (await routes.callback(new Request("https://www.loom-labs.ai/api/auth/callback?code=fixture")))
      .status,
  ).toBe(400);
  expect(callback).not.toHaveBeenCalled();
});
it.each([
  "https://evil.example/",
  "https://login.loom-labs.ai/",
  "https://auth.loom-labs.ai/",
  "https://www.loom-labs.ai/#workspace",
])("revalidates SDK targets after protocol verification: %s", async (target) => {
  callback.mockResolvedValue(target);
  const response = await routes.callback(new Request(`${origin}/api/auth/callback`));
  expect(response.status).toBe(400);
  expect(response.headers.has("location")).toBe(false);
});
it("uses the workspace fallback for an absent SDK postRedirectUri and fails closed on SDK errors", async () => {
  callback.mockResolvedValue(undefined);
  expect(
    (await routes.callback(new Request(`${origin}/api/auth/callback`))).headers.get("location"),
  ).toBe("https://www.loom-labs.ai/workspace");
  callback.mockRejectedValue(new Error("fixture-provider-error"));
  expect((await routes.callback(new Request(`${origin}/api/auth/callback`))).status).toBe(503);
});
it("validates each product's exact write Origin and returns logout to that product", async () => {
  const post = (source: string) =>
    new Request("https://checkout.loom-labs.ai/api/auth/logout", {
      method: "POST",
      headers: { origin: source },
    });
  expect((await routes.logout(post("https://www.loom-labs.ai"))).status).toBe(403);
  expect(signOut).not.toHaveBeenCalled();
  expect((await routes.logout(post("https://checkout.loom-labs.ai"))).status).toBe(303);
  expect(signOut).toHaveBeenCalledWith("https://checkout.loom-labs.ai/");
  signOut.mockRejectedValue(new Error("fixture"));
  expect((await routes.logout(post("https://checkout.loom-labs.ai"))).status).toBe(503);
});
it("supports the central host's own logout while rejecting a sibling Origin and unknown host", async () => {
  getEnv.mockResolvedValue({ ...env, LOGIN_URL: origin });
  const post = (host: string, source: string) =>
    new Request(`${host}/api/auth/logout`, {
      method: "POST",
      headers: { origin: source },
    });
  expect((await routes.logout(post(origin, origin))).status).toBe(303);
  expect(signOut).toHaveBeenCalledWith(`${origin}/`);
  signOut.mockClear();
  expect((await routes.logout(post(origin, "https://checkout.loom-labs.ai"))).status).toBe(403);
  expect(
    (await routes.logout(post("https://unknown.loom-labs.ai", "https://checkout.loom-labs.ai")))
      .status,
  ).toBe(403);
  expect(signOut).not.toHaveBeenCalled();
});
it("allows only configured local product origins during development", () => {
  expect(
    resolveLoginReturnTarget(
      new URLSearchParams({ returnTo: "http://localhost:3000/workspace?q=1" }),
      {
        config: { ...config, baseUrl: "http://localhost:3001" },
        successUrl: "http://localhost:3000/",
      },
      { APP_URL: "http://localhost:3001" },
    ),
  ).toBe("http://localhost:3000/workspace?q=1");
});

it("uses a same-product Referer only when no explicit destination is supplied", async () => {
  const referer = "https://www.loom-labs.ai/pricing?source=ssr";
  getEnv.mockResolvedValue({ ...env, APP_URL: "https://www.loom-labs.ai" });
  const response = await routes.login(
    new Request("https://www.loom-labs.ai/api/auth/login", { headers: { referer } }),
  );
  expect(new URL(response.headers.get("location")!).searchParams.get("returnTo")).toBe(referer);
  const foreign = await routes.login(
    new Request("https://www.loom-labs.ai/api/auth/login", {
      headers: { referer: "https://evil.example" },
    }),
  );
  expect(new URL(foreign.headers.get("location")!).searchParams.get("returnTo")).toBe(
    "https://www.loom-labs.ai/workspace",
  );
  const explicit = await routes.login(
    new Request(`https://www.loom-labs.ai/api/auth/login${encoded}`, { headers: { referer } }),
  );
  expect(new URL(explicit.headers.get("location")!).searchParams.get("returnTo")).toBe(product);
});
