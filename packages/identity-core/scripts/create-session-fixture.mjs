// Synthetic local transport/expiry fixtures. No real tokens or production credentials.
// Compile the actual repository modules with the same server-only test stub as Vitest.
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

function moduleUrl(file, replacements = {}) {
  let source = transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText.replace('import "server-only";', 'import "data:text/javascript,export{}";');
  for (const [specifier, url] of Object.entries(replacements))
    source = source.replace(`from "${specifier}"`, `from "${url}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const cipher = moduleUrl("../src/session-crypto.ts");
const { SessionRepository, SESSION_TTL_MS } = await import(
  moduleUrl("../src/session-repository.ts", { "./session-crypto": cipher })
);
const key = process.env.SHARED_SESSION_TEST_KEY;
if (!key || key.length < 32) throw new Error("Generated local-only fixture key required");
const appId = "7wqbzelu2ey5n5brfr73d";
const endpoint = "http://localhost:59999"; // No public OIDC provider is contacted.
const now = Date.now();
const statements = [];
const database = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async run() {
            statements.push({ sql, values });
            return { meta: { changes: 1 } };
          },
        };
      },
    };
  },
};
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const data = {
  idToken: `${encoded({ alg: "none" })}.${encoded({ sub: "local-opaque-domain-fixture", iss: `${endpoint}/oidc`, aud: appId, exp: Math.floor(now / 1000) + 3600, iat: Math.floor(now / 1000) })}.fixture`,
  refreshToken: "fixture-only-never-sent-to-a-provider",
  accessToken: JSON.stringify({
    "@": {
      token: "fixture-only-access-token",
      expiresAt: Math.floor(now / 1000) + 3600,
      scope: "openid offline_access profile",
    },
  }),
};
async function create(age = 0) {
  return new SessionRepository(database, {
    appId,
    endpoint,
    cookieSecret: key,
    now: () => now - age,
  }).create(data);
}
const fixtures = {
  valid: await create(),
  nearAbsoluteExpiry: await create(SESSION_TTL_MS - 60_000),
  expired: await create(SESSION_TTL_MS + 1_000),
  revoked: await create(),
  abandoned: await create(),
};
const repository = new SessionRepository(database, { appId, endpoint, cookieSecret: key });
await repository.revoke(fixtures.revoked.id);
// Bind by the hash in the last INSERT rather than exposing raw identifiers in SQL.
const lastInsert = statements.filter((statement) => statement.sql.includes("INSERT")).at(-1);
statements.push({
  sql: "UPDATE auth_sessions SET lock_token=?,lock_until=? WHERE id_hash=?",
  values: ["fixture-abandoned-lease", now - 1, lastInsert.values[0]],
});
console.log(JSON.stringify({ fixtures, statements, realOidcLogin: false, endpoint }));
