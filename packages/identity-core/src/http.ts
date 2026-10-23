import "server-only";

import type { ApiFailure, ApiSuccess } from "./contract";
import { HTTP_ERROR_CODES, type ApiErrorType } from "./http-codes";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorType,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function jsonSuccess<T>(data: T): Response {
  const body: ApiSuccess<T> = { code: 0, msg: "success", data };
  return Response.json(body, { headers: privateHeaders });
}

// These are diagnostic labels, never provider messages or arbitrary error properties.
const oauthDiagnosticCodes = new Set([
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "login_required",
  "interaction_required",
  "consent_required",
]);

const sdkDiagnosticCodes = new Set([
  "sign_in_session.invalid",
  "sign_in_session.not_found",
  "not_authenticated",
  "fetch_user_info_failed",
  "user_cancelled",
  "missing_scope_organizations",
  "callback_uri_verification.redirect_uri_mismatched",
  "callback_uri_verification.error_found",
  "callback_uri_verification.missing_state",
  "callback_uri_verification.state_mismatched",
  "callback_uri_verification.missing_code",
  "id_token.invalid_iat",
  "id_token.invalid_token",
  "crypto_subtle_unavailable",
  "unexpected_response_error",
  "rate_limited",
  "http_error_400",
  "http_error_401",
  "http_error_403",
  "http_error_404",
  "http_error_408",
  "http_error_429",
  "http_error_500",
  "http_error_502",
  "http_error_503",
  "http_error_504",
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
  "ERR_JWKS_TIMEOUT",
  "ERR_JWKS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWS_INVALID",
  "ERR_JWT_INVALID",
  "ERR_JWK_INVALID",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
]);

function ownDiagnosticValue(value: object, property: string): unknown {
  // Do not evaluate getters supplied by an arbitrary thrown object.
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function diagnosticLabels(error: Error): { code?: string; oauthError?: string } {
  const candidate = ownDiagnosticValue(error, "code");
  const code =
    typeof candidate === "string" &&
    (sdkDiagnosticCodes.has(candidate) || oauthDiagnosticCodes.has(candidate))
      ? candidate
      : undefined;
  const data = ownDiagnosticValue(error, "data");
  const oauthCandidate =
    data !== null && typeof data === "object" ? ownDiagnosticValue(data, "error") : undefined;
  const oauthError =
    typeof oauthCandidate === "string" && oauthDiagnosticCodes.has(oauthCandidate)
      ? oauthCandidate
      : undefined;
  return { ...(code ? { code } : {}), ...(oauthError ? { oauthError } : {}) };
}

function redactFrame(frame: string): string {
  return frame
    .slice(0, 1_024)
    .replace(/https?:\/\/[^\s)]+/g, (value) => {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[redacted-url]";
      }
    })
    .replace(/\b(?:[spr]k_(?:test|live)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+)\b/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[redacted]");
}

function diagnosticError(error: unknown, seen = new Set<unknown>(), depth = 0): object {
  if (!(error instanceof Error)) return { name: "NonErrorCause" };
  if (seen.has(error) || depth >= 4) return { name: "CauseTruncated" };
  seen.add(error);
  // Error messages and arbitrary properties can contain tokens or provider payloads.
  // Keep stack locations and the cause chain without serializing that source material.
  const name =
    /^[A-Za-z][A-Za-z0-9_.]{0,79}(?:Error|Exception)$/.test(error.name) &&
    !/\b(?:[spr]k_(?:test|live)_|whsec_|eyJ)/.test(error.name)
      ? error.name
      : "Error";
  const rawStack = error.stack ?? "";
  const messagePrefix = `${error.name}: ${error.message}`;
  const stackLocations = rawStack.startsWith(messagePrefix)
    ? rawStack.slice(messagePrefix.length)
    : rawStack;
  const frames = stackLocations
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, 12)
    .map(redactFrame);
  return {
    name,
    ...diagnosticLabels(error),
    stack: [name, ...frames].join("\n"),
    ...(error.cause !== undefined ? { cause: diagnosticError(error.cause, seen, depth + 1) } : {}),
  };
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    if (error.status >= 500) console.error("Identity request failed", diagnosticError(error));
    const body: ApiFailure = {
      code: HTTP_ERROR_CODES[error.code],
      msg: error.message,
      error: { type: error.code },
    };
    return Response.json(body, { status: error.status, headers: privateHeaders });
  }
  console.error("Identity request failed", diagnosticError(error));
  const body: ApiFailure = {
    code: HTTP_ERROR_CODES.service_unavailable,
    msg: "服务暂时不可用，请稍后重试。",
    error: { type: "service_unavailable" },
  };
  return Response.json(body, { status: 503, headers: privateHeaders });
}

export function requireSameOrigin(request: Request, appUrl: string): void {
  let expected: URL;
  try {
    expected = new URL(appUrl);
  } catch {
    throw new ApiError(503, "invalid_app_url", "应用访问地址尚未正确配置。");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname);
  if (
    (expected.protocol !== "https:" && !(expected.protocol === "http:" && local)) ||
    expected.username ||
    expected.password
  ) {
    throw new ApiError(503, "invalid_app_url", "应用访问地址必须使用 HTTPS。");
  }
  if (request.headers.get("origin") !== expected.origin) {
    throw new ApiError(403, "invalid_origin", "请求来源不受信任。");
  }
}
