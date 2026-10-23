import "server-only";
import NodeClient from "@logto/node/edge";
import type { LogtoConfig, Storage, StorageKey } from "@logto/node";
import type { SessionData } from "./session-repository";

/** SDK writes stay staged until validation and one database CAS succeed. */
export class StagedStorage implements Storage<StorageKey> {
  readonly data: SessionData;
  constructor(data: SessionData = {}) {
    this.data = { ...data };
  }
  async getItem(key: StorageKey) {
    return this.data[key] ?? null;
  }
  async setItem(key: StorageKey, value: string) {
    this.data[key] = value;
  }
  async removeItem(key: StorageKey) {
    delete this.data[key];
  }
}

/** Keep credentials on the configured issuer, and provider payloads out of SDK error logs. */
function privateTransport(config: LogtoConfig): typeof fetch {
  const origin = new URL(config.endpoint).origin;
  const credentials = new TextEncoder().encode(`${config.appId}:${config.appSecret ?? ""}`);
  const authorization = `Basic ${btoa(String.fromCharCode(...credentials))}`;
  return async (input, init) => {
    // Workerd supports manual/follow only. Never forward credentials through a redirect.
    const request = new Request(input, { ...init, redirect: "manual" });
    if (new URL(request.url).origin !== origin) throw new Error("Untrusted identity endpoint");
    if (config.appSecret) request.headers.set("Authorization", authorization);
    const response = await fetch(request);
    if (response.status >= 300 && response.status < 400)
      throw new Error("Unexpected authentication redirect");
    if (response.ok) return response;
    // The SDK logs failed responses before throwing; never pass it an original provider body.
    return Response.json(
      {
        code: response.status === 429 ? "rate_limited" : `http_error_${response.status}`,
        message: "Authentication request failed",
      },
      { status: response.status },
    );
  };
}

export function openSdk(config: LogtoConfig, data: SessionData = {}) {
  const storage = new StagedStorage(data);
  let navigateUrl: string | undefined;
  const client = new NodeClient(
    { ...config, requestTimeoutMs: 5_000 },
    { storage, fetch: privateTransport(config), navigate: (url) => void (navigateUrl = url) },
  );
  return { client, storage, destination: () => navigateUrl };
}

export function hasFreshAccessToken(data: SessionData, now: number): boolean {
  try {
    const value = JSON.parse(data.accessToken ?? "null")?.["@"];
    return typeof value?.token === "string" && value.expiresAt > now / 1_000 + 60;
  } catch {
    return false;
  }
}

export async function boundedProtocol<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Authentication request timed out")), 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
