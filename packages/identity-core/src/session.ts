import "server-only";
import NodeClient from "@logto/node/edge";
import { CookieStorage, type LogtoConfig, type SignInOptions } from "@logto/node";
import { cookies } from "next/headers";

export type SessionConfig = LogtoConfig & {
  baseUrl: string;
  cookieSecret: string;
  cookieSecure: boolean;
  cookieDomain?: string;
};

export const sessionCookieName = (config: SessionConfig): string =>
  `${config.cookieSecure ? "__Secure-" : ""}loom_session_${config.appId}`;

/** Transport adapter only; the official client owns every OAuth/OIDC check. */
export default class LogtoSessionClient {
  constructor(private readonly config: SessionConfig) {}

  private async open(readOnly = false) {
    const cookieStore = await cookies();
    const domain = this.config.cookieDomain ? { domain: this.config.cookieDomain } : {};
    const storage = new CookieStorage({
      encryptionKey: this.config.cookieSecret,
      cookieKey: sessionCookieName(this.config),
      isSecure: this.config.cookieSecure,
      getCookie: (name) => cookieStore.get(name)?.value,
      setCookie: (name, value, options) => {
        if (!readOnly) cookieStore.set(name, value, { ...options, ...domain });
      },
    });
    await storage.init();
    let navigateUrl: string | undefined;
    const client = new NodeClient(this.config, {
      storage,
      navigate: (url) => {
        navigateUrl = url;
      },
    });
    return { client, cookieStore, getNavigateUrl: () => navigateUrl, domain };
  }

  async handleSignIn(options: SignInOptions): Promise<{ url: string }> {
    const { client, getNavigateUrl } = await this.open();
    await client.signIn(options);
    const url = getNavigateUrl();
    if (!url) throw new Error("Missing SDK sign-in navigation");
    return { url };
  }

  async handleSignInCallback(callbackUrl: string): Promise<string | undefined> {
    const { client, getNavigateUrl } = await this.open();
    await client.handleSignInCallback(callbackUrl);
    return getNavigateUrl();
  }

  async handleSignOut(returnTo: string): Promise<string> {
    const { client, cookieStore, getNavigateUrl, domain } = await this.open();
    try {
      await client.signOut(returnTo);
    } finally {
      const options = {
        path: "/",
        httpOnly: true,
        secure: this.config.cookieSecure,
        sameSite: "lax" as const,
        maxAge: 0,
        expires: new Date(0),
      };
      // Domain/Path must match creation. Expire the obsolete host-only SDK cookie
      // on the current host too; it is never accepted as the new shared session.
      cookieStore.set(sessionCookieName(this.config), "", { ...options, ...domain });
      cookieStore.set(`logto_${this.config.appId}`, "", options);
    }
    const url = getNavigateUrl();
    if (!url) throw new Error("Missing SDK sign-out navigation");
    return url;
  }

  async getContext() {
    const { client } = await this.open(true);
    return client.getContext();
  }
}

export async function getLogtoContext(config: SessionConfig) {
  return new LogtoSessionClient(config).getContext();
}
