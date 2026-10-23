import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type IdentityEnv = {
  DB?: D1Database;
  APP_URL?: string;
  LOGIN_URL?: string;
  AUTH_SUCCESS_URL?: string;
  LOGTO_ENDPOINT?: string;
  LOGTO_USER_NAMESPACE?: string;
  LOGTO_APP_ID?: string;
  LOGTO_APP_SECRET?: string;
  LOGTO_COOKIE_SECRET?: string;
  LOGTO_COOKIE_DOMAIN?: string;
  STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
};

declare global {
  interface CloudflareEnv extends IdentityEnv {}
}

const variableNames = [
  "APP_URL",
  "LOGIN_URL",
  "AUTH_SUCCESS_URL",
  "LOGTO_ENDPOINT",
  "LOGTO_USER_NAMESPACE",
  "LOGTO_APP_ID",
  "LOGTO_APP_SECRET",
  "LOGTO_COOKIE_SECRET",
  "LOGTO_COOKIE_DOMAIN",
  "STRIPE_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
] as const;

export async function getEnv(): Promise<IdentityEnv> {
  const { env } = await getCloudflareContext({ async: true });
  const result: IdentityEnv = { DB: env.DB };
  for (const name of variableNames) {
    // Blank template values in .dev.vars must not hide next dev's .env.local.
    result[name] =
      name === "STRIPE_MODE" ? (env[name] ?? process.env[name]) : env[name] || process.env[name];
  }
  return result;
}
