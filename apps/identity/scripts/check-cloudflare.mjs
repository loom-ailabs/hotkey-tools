import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
if (config.includes("00000000-0000-0000-0000-000000000000")) {
  console.error(
    "Run mise identity db-create, set the returned database_id in apps/identity/wrangler.jsonc, then run mise identity db-migrate before deploying.",
  );
  process.exitCode = 1;
}
