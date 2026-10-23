import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findBundledSecretSettings } from "./check-worker-env.mjs";

test("blocks secrets from every compiled dotenv mode, while allowing runtime-only secrets", () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "worker-env-test-"));
  const appRoot = join(repositoryRoot, "apps/web");
  mkdirSync(appRoot, { recursive: true });
  try {
    writeFileSync(join(appRoot, ".dev.vars"), "LOGTO_APP_SECRET=fixture-local-secret\n");
    writeFileSync(
      join(appRoot, ".env.local"),
      "APP_URL=https://www.example.com\nLOGTO_APP_SECRET=\nLOGTO_COOKIE_SECRET=\n",
    );
    assert.deepEqual(findBundledSecretSettings(repositoryRoot, appRoot), []);
    writeFileSync(join(appRoot, ".env.local"), "LOGTO_APP_SECRET=fixture-do-not-inline\n");
    writeFileSync(
      join(repositoryRoot, ".env.development.local"),
      "CLOUDFLARE_API_TOKEN=fixture-do-not-inline\n",
    );
    writeFileSync(join(appRoot, ".env.test.local"), "STRIPE_SECRET_KEY=fixture-do-not-inline\n");
    const problems = findBundledSecretSettings(repositoryRoot, appRoot);
    assert.deepEqual(problems.map(({ key }) => key).sort(), [
      "CLOUDFLARE_API_TOKEN",
      "LOGTO_APP_SECRET",
      "STRIPE_SECRET_KEY",
    ]);
    assert.ok(problems.every(({ file }) => !file.startsWith(repositoryRoot)));
    assert.ok(!JSON.stringify(problems).includes("fixture-do-not-inline"));
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
