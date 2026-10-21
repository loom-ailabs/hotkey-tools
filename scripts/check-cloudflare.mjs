import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../apps/worker/wrangler.jsonc", import.meta.url), "utf8");
const isConfigured = !config.includes("00000000-0000-0000-0000-000000000000");

if (process.argv.includes("--status")) {
  console.log(
    `D1 database: ${isConfigured ? "configured" : "local only; remote database_id required"}`,
  );
} else if (!isConfigured) {
  console.error(
    "请先运行 mise run cloudflare-db-create，将输出的 database_id 写入 apps/worker/wrangler.jsonc，再执行远端迁移和部署。",
  );
  process.exitCode = 1;
}
