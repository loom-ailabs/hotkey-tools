import "server-only";
import { NextResponse } from "next/server";
import type { createAuthService, AuthEnv } from "./auth";
import { ApiError, jsonError, privateHeaders, requireSameOrigin } from "./http";
import { validateReturnTarget } from "./return-target";

type AuthClient = Awaited<ReturnType<ReturnType<typeof createAuthService>["getAuthClient"]>>;

function signInUiLocale(request: Request): "zh-CN" | "en" {
  const preferences = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("LOOM_LOCALE="))
    .map((item) => item.slice("LOOM_LOCALE=".length));
  return preferences.length === 1 && preferences[0] === "zh" ? "zh-CN" : "en";
}

function signInTheme(request: Request): "light" | "dark" | undefined {
  const preferences = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("LOOM_THEME="))
    .map((item) => item.slice("LOOM_THEME=".length));
  const value = preferences.length === 1 ? preferences[0] : undefined;
  return value === "light" || value === "dark" ? value : undefined;
}

export function resolveLoginReturnTarget(
  search: URLSearchParams,
  auth: Pick<AuthClient, "config" | "successUrl">,
  env: AuthEnv,
): string {
  const targets = search.getAll("returnTo");
  const destinations = search.getAll("destination");
  const destination = destinations[0] ?? "website";
  if (
    targets.length > 1 ||
    destinations.length > 1 ||
    !["website", "checkout"].includes(destination)
  ) {
    throw new ApiError(400, "invalid_login_destination", "登录后的访问位置无效。");
  }
  const defaultTarget =
    destination === "checkout"
      ? new URL("/", env.APP_URL).toString()
      : new URL("/workspace", auth.successUrl).toString();
  return validateReturnTarget(targets[0] ?? defaultTarget, {
    loginUrl: auth.config.baseUrl,
    authEndpoint: auth.config.endpoint,
    localOrigins: [
      new URL(env.APP_URL ?? auth.config.baseUrl).origin,
      new URL(auth.successUrl).origin,
    ],
  });
}

export function createAuthRoutes({
  getAuthClient,
  getEnv,
  getUser,
}: {
  getAuthClient: ReturnType<typeof createAuthService>["getAuthClient"];
  getEnv: () => Promise<AuthEnv>;
  getUser: ReturnType<typeof createAuthService>["getUser"];
}) {
  async function login(request: Request) {
    try {
      const auth = await getAuthClient();
      const env = await getEnv();
      const requestUrl = new URL(request.url);
      const search = new URLSearchParams(requestUrl.search);
      if (
        !search.has("returnTo") &&
        !search.has("destination") &&
        requestUrl.origin !== auth.config.baseUrl
      ) {
        try {
          const referer = new URL(request.headers.get("referer") ?? "");
          if (referer.origin === new URL(env.APP_URL ?? "").origin && !referer.hash)
            search.set("returnTo", referer.toString());
        } catch {
          /* Missing or unrelated Referer keeps the fixed default. */
        }
      }
      const target = resolveLoginReturnTarget(search, auth, env);
      const providers = requestUrl.searchParams.getAll("provider");
      const provider = providers[0];
      if (
        providers.length > 1 ||
        (provider !== undefined && !["google", "github"].includes(provider))
      ) {
        throw new ApiError(400, "invalid_login_provider", "登录方式无效。");
      }
      // All products begin OIDC on the central host. No arbitrary client URI is forwarded.
      if (requestUrl.origin !== auth.config.baseUrl) {
        const portal = new URL("/", auth.config.baseUrl);
        portal.searchParams.set("returnTo", target);
        return NextResponse.redirect(portal, { status: 303, headers: privateHeaders });
      }
      if (await getUser())
        return NextResponse.redirect(target, { status: 303, headers: privateHeaders });
      const theme = signInTheme(request);
      const { url } = await auth.client.handleSignIn({
        redirectUri: `${auth.config.baseUrl}/api/auth/callback`,
        postRedirectUri: target,
        extraParams: { ui_locales: signInUiLocale(request), ...(theme ? { theme } : {}) },
        ...(provider ? { directSignIn: { method: "social" as const, target: provider } } : {}),
      });
      return NextResponse.redirect(url, { status: 303, headers: privateHeaders });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function callback(request: Request) {
    try {
      const { client, config, successUrl } = await getAuthClient();
      if (new URL(request.url).origin !== config.baseUrl)
        throw new ApiError(400, "invalid_auth_callback", "请从统一登录入口重新登录。");
      const callbackUrl = new URL("/api/auth/callback", config.baseUrl);
      callbackUrl.search = new URL(request.url).search;
      // The official SDK authenticates state, PKCE, issuer, audience and signature,
      // then restores the target held in its encrypted sign-in session.
      const returnedUrl = await client.handleSignInCallback(callbackUrl.toString());
      const env = await getEnv();
      const target = validateReturnTarget(
        returnedUrl ?? new URL("/workspace", successUrl).toString(),
        {
          loginUrl: config.baseUrl,
          authEndpoint: config.endpoint,
          localOrigins: [new URL(env.APP_URL ?? config.baseUrl).origin, new URL(successUrl).origin],
        },
      );
      return NextResponse.redirect(target, { status: 303, headers: privateHeaders });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function logout(request: Request) {
    try {
      const env = await getEnv();
      const origin = new URL(request.url).origin;
      // Identity serves both configured hosts, but each write still requires its exact Origin.
      const expected =
        env.LOGIN_URL && origin === new URL(env.LOGIN_URL).origin
          ? env.LOGIN_URL
          : (env.APP_URL ?? "");
      requireSameOrigin(request, expected);
      if (origin !== new URL(expected).origin)
        throw new ApiError(403, "invalid_origin", "请求来源不受信任。");
      const { client } = await getAuthClient();
      const url = await client.handleSignOut(new URL("/", expected).toString());
      return NextResponse.redirect(url, { status: 303, headers: privateHeaders });
    } catch (error) {
      return jsonError(error);
    }
  }
  return { login, callback, logout };
}
