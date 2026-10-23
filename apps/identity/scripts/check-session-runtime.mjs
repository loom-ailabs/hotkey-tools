import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

// Wrangler compiles the actual TypeScript module and official SDK for workerd.
// All outbound fetches are replaced inside the Worker; no .env or credentials are read.
const source = fileURLToPath(
  new URL("../../../packages/identity-core/src/session-sdk.ts", import.meta.url),
);
const serverOnly = fileURLToPath(
  new URL("../../../packages/identity-core/test/server-only.ts", import.meta.url),
);
const directory = await mkdtemp(join(tmpdir(), "identity-session-transport-"));
let worker;

try {
  const entry = join(directory, "worker.ts");
  const config = join(directory, "wrangler.json");
  await writeFile(
    config,
    JSON.stringify({
      name: "identity-session-transport-local-check",
      compatibility_date: "2026-10-22",
      compatibility_flags: ["nodejs_compat"],
      alias: { "server-only": serverOnly },
    }),
  );
  await writeFile(
    entry,
    `
    import { openSdk } from ${JSON.stringify(source)};
    export default { async fetch() {
      const origin = 'https://auth.session-fixture.test';
      const appId = 'fixture-app';
      const appSecret = 'generated-fixture-secret';
      const authorization = 'Basic ' + btoa(appId + ':' + appSecret);
      const calls = [];
      let rejectRedirect = 0;
      let requestBodyVerified = false;
      let rejectedCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push({ origin: new URL(request.url).origin, redirect: request.redirect,
          authenticated: request.headers.get('Authorization') === authorization });
        if (new URL(request.url).origin !== origin) throw new Error('Outbound origin violated');
        if (request.url.endsWith('/.well-known/openid-configuration')) {
          return Response.json({ issuer: origin + '/oidc', jwks_uri: origin + '/oidc/jwks',
            authorization_endpoint: origin + '/oidc/auth', token_endpoint: origin + '/oidc/token',
            revocation_endpoint: origin + '/oidc/revoke', end_session_endpoint: origin + '/oidc/end' });
        }
        if (request.url.endsWith('/token')) {
          const body = new URLSearchParams(await request.text());
          requestBodyVerified = body.get('refresh_token') === 'fixture-refresh-token'
            && body.get('grant_type') === 'refresh_token';
          return new Response(null, { status: rejectRedirect,
            headers: { Location: 'https://outside.session-fixture.test/steal' } });
        }
        throw new Error('Unexpected fixture request');
      };
      try {
        const login = openSdk({ endpoint: origin + '/start', appId, appSecret });
        await login.client.signIn({ redirectUri: 'https://login.session-fixture.test/callback' });
        const signInSucceeded = new URL(login.destination()).origin === origin;
        for (const status of [301, 302, 303, 307, 308]) {
          rejectRedirect = status;
          const sdk = openSdk({ endpoint: origin + '/redirect-' + status, appId, appSecret },
            { idToken: 'fixture-present-id-token', refreshToken: 'fixture-refresh-token' });
          try { await sdk.client.getAccessToken(); }
          catch (error) { if (error.message === 'Unexpected authentication redirect') rejectedCount++; }
        }
        return Response.json({ signInSucceeded, redirectsRejected: rejectedCount === 5,
          allRequestsManual: calls.every(call => call.redirect === 'manual'),
          credentialsBoundToIssuer: calls.every(call => call.origin === origin && call.authenticated),
          noRedirectFollowed: calls.length === 11,
          refreshBodyVerified: requestBodyVerified });
      } finally { globalThis.fetch = originalFetch; }
    }};
  `,
  );
  worker = await unstable_dev(entry, {
    config,
    envFiles: [],
    local: true,
    port: 0,
    inspectorPort: 0,
    persist: false,
    logLevel: "error",
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  const response = await worker.fetch();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    signInSucceeded: true,
    redirectsRejected: true,
    allRequestsManual: true,
    credentialsBoundToIssuer: true,
    noRedirectFollowed: true,
    refreshBodyVerified: true,
  });
  console.log(
    "Workerd session transport passed: SDK sign-in, manual redirects, 3xx rejection, credential and refresh-body isolation.",
  );
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
