import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const sessionConfig = {
  appId: "session-fixture-app",
  appSecret: "fixture-app-secret",
  endpoint: "https://session-fixture.logto.test",
  cookieSecret: "fixture-session-key-with-more-than-thirty-two-characters",
};
export const issuer = `${sessionConfig.endpoint}/oidc`;
const keys = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
const wrongKeys = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
export const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "fixture-key",
  alg: "ES384",
  use: "sig",
};

export function idToken(claims: Record<string, unknown> = {}, wrongSignature = false) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES384", kid: "fixture-key" })).toString(
    "base64url",
  );
  const body = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: sessionConfig.appId,
      sub: "fixture-subject",
      iat: now,
      exp: now + 3600,
      ...claims,
    }),
  ).toString("base64url");
  const input = `${header}.${body}`;
  const signature = sign("sha384", Buffer.from(input), {
    key: wrongSignature ? wrongKeys.privateKey : keys.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${signature.toString("base64url")}`;
}

export const sdkData = (claims: Record<string, unknown> = {}) => ({
  idToken: idToken(claims),
  refreshToken: "fixture-refresh-old",
  accessToken: JSON.stringify({
    "@": {
      token: "fixture-access-old",
      expiresAt: Date.now() / 1000 + 3600,
      scope: "openid offline_access",
    },
  }),
});

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function sqliteSession() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(
    readFileSync(
      new URL("../../../apps/identity/migrations/0002_sessions.sql", import.meta.url),
      "utf8",
    ),
  );
  let failCommit = false;
  const binding = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      return {
        bind(...parameters: SQLInputValue[]) {
          values = parameters;
          return this;
        },
        async first() {
          return raw.prepare(sql).get(...values) ?? null;
        },
        async run() {
          if (failCommit && sql.includes("refreshed_at ="))
            throw new Error("fixture D1 commit failed");
          return {
            success: true,
            meta: { changes: Number(raw.prepare(sql).run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      raw.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    withSession() {
      return binding;
    },
  };
  return {
    raw,
    db: binding as unknown as D1Database,
    failCommit: () => {
      failCommit = true;
    },
  };
}

export async function protocolFixture() {
  // jose's Node runtime fetches JWKS using node:http rather than global fetch.
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const jwksUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
  const config = { ...sessionConfig, endpoint: `${sessionConfig.endpoint}/${randomUUID()}` };
  const grants: URLSearchParams[] = [];
  const revocations: URLSearchParams[] = [];
  const requests: {
    url: string;
    redirect: string;
    headers: { get: (name: string) => string | null; has: (name: string) => boolean };
  }[] = [];
  let tokenEndpoint = `${issuer}/token`;
  let unavailable = false;
  let tokenResponse = async () =>
    Response.json({
      access_token: "fixture-access-new",
      refresh_token: "fixture-refresh-new",
      id_token: idToken(),
      token_type: "Bearer",
      scope: "openid offline_access",
      expires_in: 3600,
    });
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({ url: request.url, redirect: request.redirect, headers: request.headers });
    if (unavailable) throw new Error("fixture provider unavailable");
    const url = request.url;
    if (url.endsWith("/oidc/.well-known/openid-configuration"))
      return Response.json({
        issuer,
        jwks_uri: jwksUri,
        token_endpoint: tokenEndpoint,
        authorization_endpoint: `${issuer}/auth`,
        end_session_endpoint: `${issuer}/session/end`,
        revocation_endpoint: `${issuer}/token/revocation`,
      });
    if (url.endsWith("/jwks")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/token/revocation")) {
      revocations.push(new URLSearchParams(await request.text()));
      return Response.json({});
    }
    if (url.endsWith("/token")) {
      grants.push(new URLSearchParams(await request.text()));
      return tokenResponse();
    }
    throw new Error("Unexpected fixture URL");
  };
  return {
    config,
    fetcher,
    grants,
    revocations,
    requests,
    respond: (response: () => Promise<Response>) => {
      tokenResponse = response;
    },
    setTokenEndpoint: (url: string) => {
      tokenEndpoint = url;
    },
    makeUnavailable: () => {
      unavailable = true;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
