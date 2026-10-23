import { spawnSync } from "node:child_process";

const commands = [
  ["dev", "启动 Next.js 开发服务"],
  ["build", "构建 Next.js 和 Workers 部署产物"],
  ["preview", "在本地 Workers runtime 预览"],
  ["deploy", "构建并部署到 Cloudflare"],
  ["deploy-dry-run", "构建并检查打包，不发布远端资源"],
  ["check-types", "检查 TypeScript 类型"],
  ["lint", "检查代码规范"],
  ["test", "运行测试"],
  ["coverage", "运行测试与覆盖率检查"],
  ["check-crypto", "验证 Workers runtime 中的 JWT 签名"],
  ["check-session", "验证 Workers runtime 中的官方 SDK 与续期传输"],
  ["smoke", "检查已启动的应用"],
  ["verify", "依次执行 Identity 的全部检查"],
  ["db-create", "创建远端 D1 数据库"],
  ["db-migrate-local", "应用本地 D1 migrations"],
  ["db-migrate", "应用远端 D1 migrations"],
  ["login", "登录 Cloudflare 账户"],
  ["status", "读取 Cloudflare 登录状态"],
  ["logs", "订阅 Worker 的实时日志"],
  ["wrangler", "在应用目录运行 Wrangler，参数原样透传"],
];

const [command = "help", ...args] = process.argv.slice(2);
if (["help", "--help", "-h"].includes(command)) {
  console.log("用法：mise identity <命令> [参数...]\n");
  for (const [name, description] of commands) {
    console.log(`  ${name.padEnd(20)} ${description}`);
  }
  console.log(
    "\n也可使用 mise run identity:<命令>；预演任务用 mise run --dry-run identity:<命令>。",
  );
} else if (!commands.some(([name]) => name === command)) {
  console.error(`未知 Identity 命令：${command}。运行 mise identity help 查看可用命令。`);
  process.exitCode = 2;
} else {
  const result = spawnSync(
    process.env.MISE_BIN ?? "mise",
    ["run", `identity:${command}`, ...args],
    {
      stdio: "inherit",
    },
  );
  if (result.error) console.error(result.error.message);
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.status ?? 1;
}
