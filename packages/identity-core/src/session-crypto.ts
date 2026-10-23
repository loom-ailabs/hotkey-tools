import "server-only";

export type SessionData = Record<string, string>;

export type SessionCryptoConfig = {
  appId: string;
  endpoint: string;
  cookieSecret: string;
};

const encoder = new TextEncoder();
const context = "loom-d1-session-v1";

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError("Invalid session encoding");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );
}

function isSessionData(value: unknown): value is SessionData {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

/** Encrypted SDK storage; no token or identity is stored in plaintext in D1. */
export class SessionCrypto {
  private readonly key: Promise<CryptoKey>;

  constructor(private readonly config: SessionCryptoConfig) {
    if (!config.appId || !config.endpoint || config.cookieSecret.length < 32)
      throw new TypeError("Invalid session encryption configuration");
    this.key = crypto.subtle
      .importKey("raw", encoder.encode(config.cookieSecret), "HKDF", false, ["deriveKey"])
      .then((material) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: encoder.encode(context),
            info: encoder.encode(JSON.stringify([config.appId, config.endpoint])),
          },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
  }

  private aad(hash: string): Uint8Array<ArrayBuffer> {
    return encoder.encode(JSON.stringify([context, this.config.appId, this.config.endpoint, hash]));
  }

  async encrypt(hash: string, data: SessionData): Promise<string> {
    if (!isSessionData(data)) throw new TypeError("Invalid SDK session storage");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.aad(hash) },
      await this.key,
      encoder.encode(JSON.stringify(data)),
    );
    return `1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
  }

  async decrypt(hash: string, value: string): Promise<SessionData | null> {
    try {
      const parts = value.split(".");
      if (parts.length !== 3 || parts[0] !== "1") return null;
      const iv = decode(parts[1]!);
      if (iv.length !== 12) return null;
      const clear = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: this.aad(hash) },
        await this.key,
        decode(parts[2]!),
      );
      const data: unknown = JSON.parse(new TextDecoder().decode(clear));
      return isSessionData(data) ? data : null;
    } catch {
      return null;
    }
  }
}
