import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unstable_dev } from "wrangler";

// Use only generated fixture keys and tokens; never read identity credentials.
const require = createRequire(import.meta.url);
const joseWebCrypto = join(dirname(require.resolve("jose/package.json")), "dist/browser/index.js");
const directory = await mkdtemp(join(tmpdir(), "identity-jose-"));
let worker;

try {
  const entry = join(directory, "worker.mjs");
  const config = join(directory, "wrangler.json");
  await writeFile(
    config,
    JSON.stringify({ name: "identity-jose-local-check", compatibility_date: "2026-10-22" }),
  );
  await writeFile(
    entry,
    `import { generateKeyPair, SignJWT, jwtVerify } from ${JSON.stringify(joseWebCrypto)};
    export default { async fetch() {
      const { privateKey, publicKey } = await generateKeyPair('ES384');
      const token = await new SignJWT({ sub: 'generated-fixture' })
        .setProtectedHeader({ alg: 'ES384' })
        .setIssuer('https://issuer.fixture').setAudience('fixture-app')
        .setIssuedAt().setExpirationTime('1m').sign(privateKey);
      const options = { issuer: 'https://issuer.fixture', audience: 'fixture-app' };
      const valid = (await jwtVerify(token, publicKey, options)).payload.sub === 'generated-fixture';
      async function rejects(candidate, verificationOptions) {
        try { await jwtVerify(candidate, publicKey, verificationOptions); return false; }
        catch { return true; }
      }
      const parts = token.split('.');
      parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
      return Response.json({
        valid,
        tamperedRejected: await rejects(parts.join('.'), options),
        issuerRejected: await rejects(token, { ...options, issuer: 'https://wrong.fixture' }),
        audienceRejected: await rejects(token, { ...options, audience: 'wrong-app' }),
      });
    }};`,
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
    valid: true,
    tamperedRejected: true,
    issuerRejected: true,
    audienceRejected: true,
  });
  console.log("Workerd ES384 check passed: valid signature, tamper, issuer, and audience.");
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
