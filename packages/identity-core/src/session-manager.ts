import "server-only";
import type { IdTokenClaims, LogtoConfig, LogtoContext, SignInOptions } from "@logto/node";
import { ApiError } from "./http";
import { SessionRepository, type SessionData } from "./session-repository";
import { boundedProtocol, hasFreshAccessToken, openSdk } from "./session-sdk";

type Config = LogtoConfig & { cookieSecret: string };
const anonymous = (): LogtoContext => ({ isAuthenticated: false });
const validClaims = (claims: IdTokenClaims) =>
  typeof claims.sub === "string" && claims.sub.length > 0 && Number.isSafeInteger(claims.exp);

/** One authoritative, revocable session shared by every trusted subdomain. */
export class SessionManager {
  readonly repository: SessionRepository;
  private readonly now: () => number;
  private readonly pause: (ms: number) => Promise<void>;
  constructor(
    private readonly config: Config,
    database: D1Database,
    options: { now?: () => number; pause?: (ms: number) => Promise<void> } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.pause = options.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.repository = new SessionRepository(database, { ...config, now: this.now });
  }

  async start(options: SignInOptions, previousFlowId = "") {
    // Replacing the browser's flow must also cancel a callback already exchanging its code.
    await this.repository.revoke(previousFlowId);
    const sdk = openSdk(this.config);
    await boundedProtocol(sdk.client.signIn(options));
    const url = sdk.destination();
    if (!url) throw new Error("Missing SDK sign-in navigation");
    const flow = await this.repository.create(sdk.storage.data, "flow");
    return { url, flow };
  }

  async complete(flowId: string, callbackUrl: string) {
    const flow = await this.repository.read(flowId);
    if (!flow || flow.purpose !== "flow") throw this.invalidFlow();
    const lease = await this.repository.tryLock(flow);
    if (!lease) throw this.invalidFlow();
    const sdk = openSdk(this.config, flow.data);
    try {
      await boundedProtocol(sdk.client.handleSignInCallback(callbackUrl));
      const claims = await sdk.client.getIdTokenClaims();
      if (
        !validClaims(claims) ||
        claims.exp <= this.now() / 1_000 ||
        !(await sdk.client.getRefreshToken())
      )
        throw this.invalidFlow();
      const session = await this.repository.promote(flow, lease, sdk.storage.data);
      if (!session) throw this.invalidFlow();
      return { session, returnedUrl: sdk.destination() };
    } catch (error) {
      await this.repository.revoke(flowId);
      await this.remoteSignOut(sdk.storage.data);
      throw error;
    }
  }

  async context(id: string): Promise<LogtoContext> {
    for (let attempt = 0; attempt < 110; attempt++) {
      const snapshot = await this.repository.read(id);
      if (!snapshot || snapshot.purpose !== "auth") return anonymous();
      const sdk = openSdk(this.config, snapshot.data);
      let claims: IdTokenClaims;
      try {
        claims = await sdk.client.getIdTokenClaims();
        if (!validClaims(claims) || !(await sdk.client.getRefreshToken())) throw new Error();
      } catch {
        await this.repository.revoke(id);
        return anonymous();
      }
      if (claims.exp > this.now() / 1_000 + 60 && hasFreshAccessToken(snapshot.data, this.now()))
        return { isAuthenticated: true, claims };
      const lease = await this.repository.tryLock(snapshot);
      if (!lease) {
        await this.pause(200);
        continue;
      }
      try {
        // Public SDK methods force renewal even when only the ID token is near expiry.
        await boundedProtocol(
          (async () => {
            await sdk.client.clearAccessToken();
            await sdk.client.getAccessToken();
          })(),
        );
        const renewed = await sdk.client.getIdTokenClaims();
        if (
          !validClaims(renewed) ||
          renewed.sub !== claims.sub ||
          renewed.exp <= this.now() / 1_000 + 60
        )
          throw new Error("Invalid renewed identity");
        const committed = await this.repository.commit(snapshot, lease, sdk.storage.data);
        if (!committed) {
          await this.remoteSignOut(sdk.storage.data);
          return anonymous();
        }
        return { isAuthenticated: true, claims: renewed };
      } catch (error) {
        // The provider may have rotated RT. Never retry an ambiguous old snapshot.
        await this.repository.revoke(id);
        await this.remoteSignOut(sdk.storage.data);
        throw new ApiError(503, "session_renewal_failed", "登录续期失败，请重新登录。", {
          cause: error,
        });
      }
    }
    throw new ApiError(503, "session_busy", "登录状态正在更新，请稍后重试。");
  }

  async signOut(id: string, flowId: string, returnTo: string): Promise<string> {
    const snapshot = await this.repository.read(id);
    await this.repository.revoke(id);
    await this.repository.revoke(flowId);
    return (await this.remoteSignOut(snapshot?.data ?? {}, returnTo)) ?? returnTo;
  }

  private async remoteSignOut(data: SessionData, returnTo?: string) {
    const sdk = openSdk(this.config, data);
    try {
      await boundedProtocol(sdk.client.signOut(returnTo));
      return sdk.destination();
    } catch {
      return undefined;
    }
  }

  private invalidFlow() {
    return new ApiError(400, "invalid_auth_callback", "登录请求已失效，请重新登录。");
  }
}
