import "server-only";

import { ApiError } from "./http";

export type ReturnTargetOptions = {
  loginUrl: string;
  authEndpoint: string;
  localOrigins?: string[];
};

const productDomain = ".loom-labs.ai";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function invalidTarget(): never {
  throw new ApiError(
    400,
    "invalid_login_destination",
    "登录后的访问地址无效，请从产品入口重新登录。",
  );
}

function containsUnsafeCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || character === "\\" || character === "#") return true;
  }
  return false;
}

function parseTarget(value: string): URL {
  // Reject URL parser recovery and authority normalization that can hide the
  // destination from a reader. Encoded path/query data is left untouched.
  if (typeof value !== "string" || containsUnsafeCharacter(value)) {
    return invalidTarget();
  }
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || /[^\u0021-\u007e]|%/.test(authority)) return invalidTarget();

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return invalidTarget();
  }
  if (target.username || target.password) return invalidTarget();
  return target;
}

function isProductHost(hostname: string): boolean {
  if (!hostname.endsWith(productDomain) || hostname.length > 253) return false;
  const prefix = hostname.slice(0, -productDomain.length);
  return prefix.split(".").every((label) => dnsLabel.test(label));
}

function allowedConfigurationProtocol(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname));
}

export function validateReturnTarget(value: string, options: ReturnTargetOptions): string {
  const target = parseTarget(value);
  const login = parseTarget(options.loginUrl);
  const auth = parseTarget(options.authEndpoint);
  if (
    !allowedConfigurationProtocol(login) ||
    !allowedConfigurationProtocol(auth) ||
    login.pathname !== "/" ||
    login.search ||
    auth.search
  ) {
    return invalidTarget();
  }

  if (
    target.protocol === "https:" &&
    !target.port &&
    isProductHost(target.hostname) &&
    target.hostname !== login.hostname &&
    target.hostname !== auth.hostname
  ) {
    // URL.href preserves the original query serialization. Using searchParams
    // here would reorder or re-encode data such as repeated keys and spaces.
    return target.href;
  }

  if (
    login.protocol === "http:" &&
    loopbackHosts.has(login.hostname) &&
    target.protocol === "http:" &&
    loopbackHosts.has(target.hostname)
  ) {
    const allowedOrigins = (options.localOrigins ?? []).map((value) => {
      const origin = parseTarget(value);
      if (
        origin.protocol !== "http:" ||
        !loopbackHosts.has(origin.hostname) ||
        origin.pathname !== "/" ||
        origin.search
      ) {
        return invalidTarget();
      }
      return origin.origin;
    });
    if (allowedOrigins.includes(target.origin)) return target.href;
  }

  return invalidTarget();
}
