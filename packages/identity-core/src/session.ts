import "server-only";
import type { LogtoConfig, SignInOptions } from "@logto/node";
import { cookies } from "next/headers";
import { SessionManager } from "./session-manager";

export type SessionConfig = LogtoConfig & {
  baseUrl: string;
  cookieSecret: string;
  cookieSecure: boolean;
  cookieDomain?: string;
};
const prefix = (config: SessionConfig) => (config.cookieSecure ? "__Secure-" : "");
export const sessionCookieName = (config: SessionConfig) =>
  `${prefix(config)}loom_sid_${config.appId}`;
export const flowCookieName = (config: SessionConfig) =>
  `${prefix(config)}loom_flow_${config.appId}`;

/** Next.js only transports opaque identifiers; OAuth material stays encrypted in D1. */
export default class LogtoSessionClient {
  private readonly manager: SessionManager;
  constructor(
    private readonly config: SessionConfig,
    database: D1Database,
  ) {
    this.manager = new SessionManager(config, database);
  }

  private options(expiresAt: number) {
    return {
      path: "/",
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "lax" as const,
      ...(this.config.cookieDomain ? { domain: this.config.cookieDomain } : {}),
      expires: new Date(expiresAt),
      maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1_000)),
    };
  }

  async handleSignIn(options: SignInOptions): Promise<{ url: string }> {
    const store = await cookies();
    const { url, flow } = await this.manager.start(
      options,
      store.get(flowCookieName(this.config))?.value ?? "",
    );
    store.set(flowCookieName(this.config), flow.id, this.options(flow.expiresAt));
    return { url };
  }

  async handleSignInCallback(callbackUrl: string): Promise<string | undefined> {
    const store = await cookies();
    const flowId = store.get(flowCookieName(this.config))?.value ?? "";
    try {
      const { session, returnedUrl } = await this.manager.complete(flowId, callbackUrl);
      store.set(sessionCookieName(this.config), session.id, this.options(session.expiresAt));
      return returnedUrl;
    } finally {
      store.set(flowCookieName(this.config), "", this.options(0));
    }
  }

  async handleSignOut(returnTo: string): Promise<string> {
    const store = await cookies();
    try {
      return await this.manager.signOut(
        store.get(sessionCookieName(this.config))?.value ?? "",
        store.get(flowCookieName(this.config))?.value ?? "",
        returnTo,
      );
    } finally {
      const legacy = `${prefix(this.config)}loom_session_${this.config.appId}`;
      for (const name of [sessionCookieName(this.config), flowCookieName(this.config), legacy])
        store.set(name, "", this.options(0));
      const { domain: _domain, ...hostOnly } = this.options(0);
      store.set(`logto_${this.config.appId}`, "", hostOnly);
    }
  }

  async getContext() {
    const id = (await cookies()).get(sessionCookieName(this.config))?.value ?? "";
    return this.manager.context(id);
  }
}

export async function getLogtoContext(config: SessionConfig, database: D1Database) {
  return new LogtoSessionClient(config, database).getContext();
}
