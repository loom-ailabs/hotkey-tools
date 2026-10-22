import "server-only";

import LogtoClient, { getLogtoContext } from "@logto/next/server-actions";
import type { LogtoNextConfig } from "@logto/next";
import { getDatabase } from "@/server/db";
import { getEnv } from "@/server/env";
import { ApiError } from "@/server/http";

export type IdentityUser = {
  id: string;
  name?: string;
  email?: string;
};

const allowedProtocol = (url: URL) =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));

/** Public page settings only. An unset login host preserves the default checkout page. */
export async function getLoginPageConfig(): Promise<{ appUrl: string; loginUrl: string } | null> {
  const env = await getEnv();
  if (!env.LOGIN_URL?.trim()) return null;
  try {
    const urls = [new URL(env.APP_URL ?? ""), new URL(env.LOGIN_URL)];
    for (const url of urls) {
      if (
        !allowedProtocol(url) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error("Invalid public origin");
      }
    }
    return { appUrl: urls[0]!.origin, loginUrl: urls[1]!.origin };
  } catch {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "登录页访问地址尚未正确配置。");
  }
}

async function getAuthSettings() {
  const env = await getEnv();
  const required = {
    APP_URL: env.APP_URL,
    LOGTO_ENDPOINT: env.LOGTO_ENDPOINT,
    LOGTO_APP_ID: env.LOGTO_APP_ID,
    LOGTO_APP_SECRET: env.LOGTO_APP_SECRET,
    LOGTO_COOKIE_SECRET: env.LOGTO_COOKIE_SECRET,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new ApiError(
      503,
      "AUTH_NOT_CONFIGURED",
      `登录服务尚未配置，请设置 ${missing.join(", ")}.`,
    );
  }

  const cookieSecret = env.LOGTO_COOKIE_SECRET!;
  if (cookieSecret.length < 32) {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "LOGTO_COOKIE_SECRET 至少需要 32 个字符。");
  }

  let appUrl: URL;
  let endpoint: URL;
  let successUrl: URL;
  let userNamespace: URL;
  try {
    appUrl = new URL(env.APP_URL!);
    endpoint = new URL(env.LOGTO_ENDPOINT!);
    successUrl = new URL(env.AUTH_SUCCESS_URL?.trim() || appUrl.origin);
    userNamespace = new URL(env.LOGTO_USER_NAMESPACE?.trim() || endpoint.toString());
  } catch {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "登录服务的访问地址尚未正确配置。");
  }

  if (
    !allowedProtocol(appUrl) ||
    !allowedProtocol(endpoint) ||
    !allowedProtocol(successUrl) ||
    !allowedProtocol(userNamespace) ||
    appUrl.username ||
    appUrl.password ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    successUrl.username ||
    successUrl.password ||
    successUrl.pathname !== "/" ||
    successUrl.search ||
    successUrl.hash ||
    userNamespace.username ||
    userNamespace.password ||
    userNamespace.search ||
    userNamespace.hash
  ) {
    throw new ApiError(
      503,
      "AUTH_NOT_CONFIGURED",
      "登录服务的访问地址必须使用 HTTPS，本地开发除外。",
    );
  }

  const config: LogtoNextConfig = {
    appId: env.LOGTO_APP_ID!,
    appSecret: env.LOGTO_APP_SECRET!,
    endpoint: endpoint.toString().replace(/\/+$/, ""),
    baseUrl: appUrl.origin,
    cookieSecret,
    cookieSecure: appUrl.protocol === "https:",
    scopes: ["email"],
  };
  return {
    config,
    successUrl: successUrl.toString(),
    // This is an immutable local tenant namespace, not a substitute for the
    // OIDC issuer that the SDK discovers and verifies from LOGTO_ENDPOINT.
    userNamespace: userNamespace.toString().replace(/\/+$/, ""),
  };
}

export async function getLogtoConfig(): Promise<LogtoNextConfig> {
  return (await getAuthSettings()).config;
}

export async function getAuthClient() {
  const { config, successUrl } = await getAuthSettings();
  return { config, successUrl, client: new LogtoClient(config) };
}

export async function getUser(): Promise<IdentityUser | null> {
  const { config, userNamespace } = await getAuthSettings();
  // The SDK validates the OIDC callback, then decodes claims from its encrypted cookie.
  // Enforce token expiry here because reading that cookie does not revalidate expiry.
  // Expired sessions must sign in again; this application does not silently refresh.
  // ID tokens are never accepted as bearer credentials for business APIs.
  const { isAuthenticated, claims } = await getLogtoContext(config);
  if (
    !isAuthenticated ||
    !claims?.sub ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const user: IdentityUser = {
    id: claims.sub,
    ...(typeof claims.name === "string" ? { name: claims.name } : {}),
    ...(typeof claims.email === "string" ? { email: claims.email } : {}),
  };
  const database = await getDatabase();
  await database
    .prepare(
      `INSERT INTO users (id, issuer, subject, name, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (issuer, subject) DO UPDATE SET
         name = excluded.name, email = excluded.email`,
    )
    .bind(
      user.id,
      userNamespace,
      claims.sub,
      user.name ?? null,
      user.email ?? null,
      Math.floor(Date.now() / 1000),
    )
    .run();

  return user;
}
