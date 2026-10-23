# hotkey-tools

仓库包含 Loom AI 产品首页与工作区（`apps/web`）以及登录与购买应用（`apps/identity`）。两者分别使用 Next.js/OpenNext 提供页面与同源 API，共享 `.loom-labs.ai` 下的登录会话、Logto 身份与 Cloudflare D1 权益。默认 `mise run dev` 仍启动账户与购买应用；主站使用 `mise run dev-web`。

从初始化、身份源配置到支付联调的步骤见 [Identity 应用说明](apps/identity/README.md)。仓库工作约定见 [AGENTS.md](AGENTS.md)。

## 应用与共享包

| 目录                          | 技术栈                                                        | 职责                                                      |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/identity`               | Next.js 16、React 19、Tailwind CSS 4、Logto、Stripe、OpenNext | 默认产品：账户、购买、订单与付费鉴权；页面和 API 同源     |
| `packages/ui`                 | shadcn/ui 风格组件、Tailwind 主题变量、`cn()`                 | 共享 Button、Card、Badge、Alert 等基础组件                |
| `apps/web`                    | Next.js 16、React 19、TypeScript                              | Loom AI 主站、工作区与受保护演示 API                      |
| `apps/worker`                 | TypeScript、Hono、Wrangler、D1                                | 既有静态资源托管、示例 API 与 Python service binding 网关 |
| `apps/python`                 | Python 3.13、FastAPI、Pydantic                                | 快捷键规范化示例，可运行于 CPython 或 Python Worker       |
| `packages/python/hotkey-core` | Python、uv workspace                                          | Python 共享业务库                                         |

新产品使用 `apps/<产品名>` 下的独立 Next.js 全栈应用。共享认证、HTTP 与权益查询位于 `packages/identity-core`；Stripe 逻辑只在 `apps/identity`。旧 `apps/worker` 使用自己的静态占位页与示例 API。Python 仅在实际需要时作为独立能力服务使用。

## 初始化与日常开发

安装 mise 后，在仓库根目录执行：

```bash
mise trust
mise run setup
mise run env-check
mise run dev
```

默认访问 `http://localhost:3001`。`dev` 会先应用 Identity 本地 D1 migrations，再启动 Next.js 开发服务器；Cloudflare bindings 由 OpenNext 提供本地模拟。

`setup` 安装工具链、按锁文件安装 pnpm 依赖及 uv workspace 成员，在文件缺失时创建根 `.env`、Identity 的 `.env.local` 与 `.dev.vars`，并应用两个示例数据库的本地迁移。重复执行不会覆盖已有环境文件或重置数据库。Logto 和 Stripe 凭据仍需按 [应用说明](apps/identity/README.md) 配置；配置不完整时，页面会显示服务待配置，相关 API 返回 503。

| 命令                                     | 用途                                           |
| ---------------------------------------- | ---------------------------------------------- |
| `mise run dev` / `mise run dev-identity` | 启动默认账户与购买应用，端口 3001              |
| `mise run smoke`                         | 对默认应用做页面、D1、私有 API 与跨站拒绝检查  |
| `mise run dev-examples`                  | 启动既有静态 Web、网关和 Python Worker 示例    |
| `mise run dev-web`                       | Loom AI 主站热更新，端口 3000                  |
| `mise run dev-worker`                    | 构建静态 Web、迁移示例 D1、启动网关，端口 8787 |
| `mise run dev-python`                    | Python Worker，端口 8788                       |
| `mise run dev-python-local`              | CPython + Uvicorn，端口 8000                   |
| `mise run smoke-examples`                | 检查既有网关、D1 与 Python 链路                |

mise 固定 Node.js 24、pnpm 12.10.1、Python 3.13、uv 0.12.3 和 Wrangler 4.151.2。`mise run setup` 会安装这些工具。使用 `mise exec -- <command>` 执行临时命令，不修改全局工具版本。根 `.env` 服务于 workspace 和旧示例；Identity 的服务端配置放在应用自己的环境文件或 Worker 环境中。任何密钥都不能使用 `NEXT_PUBLIC_*`。

Identity 的日常操作统一使用 `mise identity <命令>`；运行 `mise identity help` 查看全部命令：

| 命令                                                   | 用途                                             |
| ------------------------------------------------------ | ------------------------------------------------ |
| `mise identity dev`                                    | 启动 Next.js 开发服务，先迁移本地 D1             |
| `mise identity build`                                  | 构建 Next.js，并生成 OpenNext/Workers 部署产物   |
| `mise identity preview`                                | 迁移本地 D1、构建并在 Workers runtime 预览       |
| `mise identity test` / `mise identity coverage`        | 测试与覆盖率检查                                 |
| `mise identity verify`                                 | 依次检查类型、lint、覆盖率、JWT 运行时和部署打包 |
| `mise identity deploy-dry-run`                         | 构建并检查打包，不发布远端资源                   |
| `mise identity deploy`                                 | 检查配置、构建并发布 Worker                      |
| `mise identity db-create` / `mise identity db-migrate` | 创建远端 D1 / 应用远端迁移                       |
| `mise identity db-migrate-local`                       | 应用本地 D1 迁移                                 |
| `mise identity login` / `mise identity status`         | Cloudflare 登录 / 登录状态                       |
| `mise identity logs`                                   | 订阅远端 Worker 日志                             |
| `mise identity wrangler <参数...>`                     | 在 Identity 目录使用 mise 管理的 Wrangler        |

这些入口对应 `mise run identity:<命令>`。检查命令将执行哪些步骤，可用 `mise run --dry-run identity:deploy`；它与实际构建打包的 `mise identity deploy-dry-run` 不同。原有 `mise run dev-identity`、`identity-db-*` 入口作为别名保留。

OpenNext 和本地验证需要导入 Wrangler 的 Node API，pywrangler 也会通过 npx 调用项目中的 Wrangler，因此 package 中仍保留必要依赖，统一精确固定为 mise 的相同版本；升级 Wrangler 时需同步修改工具配置、package 和锁文件。[mise npm 工具说明](https://mise.jdx.dev/dev-tools/backends/npm)

## 验证

```bash
mise run verify
mise identity coverage
```

`verify` 检查 uv 锁文件，执行类型检查、Oxlint/Ruff、格式检查、Vitest/pytest、各 package 构建，以及全部 Worker 的部署打包检查。Identity 的覆盖率检查范围为服务端和 HTTP API，四项阈值均为 90%。

截至 2026-10-23，最终域名方案已通过全仓 `mise run verify` 和 182 项测试；Identity 核心覆盖率为 statements 98.57%、branches 98.06%、functions 100%、lines 99.39%。旧 workers.dev 入口已完成真实 GitHub 登录、USD 1.00 Sandbox 付款开通、退出重登后持权及全额退款撤权；Workers 本地预览、本地 D1 smoke 和远端健康检查也已通过。

最终域名分工为 `login.loom-labs.ai` 统一登录与回调、`checkout.loom-labs.ai` 账户与购买、`auth.loom-labs.ai` Logto 托管认证。产品携带 `returnTo` 跳转登录页；会话有效时直接返回原产品，否则完成登录后返回。返回地址只接受受信任的 Loom 产品地址并保留路径与查询，拒绝含片段的地址。www 与 checkout 通过同一随机 SID Cookie（`Domain=.loom-labs.ai`）访问 D1 会话，不再分别进行 OIDC 登录；令牌状态只以密文保存在 D1，两者从 D1 查询同一用户的当前权益。

本轮已部署固定 14 天 D1 会话与短期令牌自动刷新：期限从成功回调起计算，刷新不延长期限；退出以 D1 撤销为准。400 项测试、全仓验证、真实 Workerd 协议检查及 53 项线上匿名检查通过；真实 GitHub 三域共享登录、有效会话直接返回、官方 SDK 刷新与共享退出已验证。受控缩短本轮测试会话截止时间后的三域拒绝，以及重新登录均已通过；这不是实际等待 14 天。旧自包含 Cookie 不再接受，需要一次重新登录；详见[会话生命周期](docs/session-lifecycle.md)。

Logto 开发/生产租户由用户预先创建，本次仅配置开发租户，生产租户未改动。新域已验证 GitHub 的两种固定返回、付款开通、退出重登持权及全额退款撤权。Google 已完成上游授权并到达显式关联页，依用户选择保持未关联，应用回调和 www 返回未验。未来可使用未占用邮箱的 Google 身份，或另行明确关联后补验；本次不继续关联。

`next build`、OpenNext build、Wrangler dry-run、本地预览、真实第三方联调与远端部署是不同的验证层级。打包或本地测试通过，不代表已完成远端迁移、登录、付款或免费套餐容量验证。

## Cloudflare 部署

Identity 使用 Workers + Static Assets + D1。页面与 API 由一个 Next.js/OpenNext Worker 提供；当前动态页面不需要 R2 ISR 缓存，也不依赖 Durable Objects、容器或独立 Node 服务器。应使用 Next.js 的 Node.js runtime 和 `nodejs_compat`，不设置 `output: "export"` 或 `runtime = "edge"`。

先配置真实账号、数据库和密钥，再部署：

```bash
mise identity login
mise identity status
mise identity db-create
# 将输出的 database_id 填入 apps/identity/wrangler.jsonc
mise identity db-migrate
# 配置 APP_URL、Logto、Stripe Sandbox 和 Worker Secrets，见应用说明
mise identity deploy
```

Identity 使用自己的 `apps/identity/migrations` 与 D1 数据库，不复用旧网关的数据库。全零 UUID 只供本地模拟；远端迁移和部署入口会拒绝该占位值。后续结构变更新增 migration，不改写已应用的迁移。

目标以 Cloudflare 免费资源验证，但项目不会自动选择、升级或证明某个套餐的可用额度；Worker 包大小、CPU、请求和 D1 配额需以实际账户及部署结果核实。参考 [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)、[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)和 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)。

既有示例的远端部署继续使用旧网关数据库与独立 Python Worker：

```bash
mise run cloudflare-db-create
# 将旧网关的 database_id 填入 apps/worker/wrangler.jsonc
mise run cloudflare-db-migrate
mise exec -- pnpm deploy:examples
```

该入口按 Python Worker → Web 构建/网关 Worker 的顺序执行；Python Worker 通过 service binding 提供服务。旧网关 `/api/hotkeys` 与 `/api/normalize` 仅用于技术链路演示，没有 Identity 的用户隔离和付费校验。

## Loom AI 主站

两应用通过 `packages/i18n` 共享 next-intl 中英文能力：中文保留原路径，英文使用 `/en`；语言与浅色、深色、跟随系统外观使用仅含偏好值的父域 Cookie。登录后的头像菜单提供个人信息、外观、语言和退出，个人信息页 `/account`、`/en/account` 禁止索引。API、登录回调和支付端点不加语言前缀，认证与权益规则保持不变。配置、消息分工和 SEO 说明见[国际化说明](docs/internationalization.md)。

[主站说明](apps/web/README.md)覆盖本地配置、共享会话和部署；[设计依据](docs/loom-product-design.md)记录 loom-box 愿景、原版 Logo、Linear 风格参考及演示能力边界。

[SEO 与 AI 检索说明](docs/seo-geo.md)记录公开页面的元数据、结构化数据、站点地图和 AI 文本入口，以及私人流程的索引限制与验证方式。

页面使用 Next.js 路径路由：`/` 产品首页、`/vision` 愿景、`/workspace` 工作区、`/pricing` 体验方案。导航与登录、支付返回均不使用 Hash 地址，每个页面都可直接打开和刷新。

```bash
mise run dev-web
mise run web:preview
mise run web:coverage
mise run web:deploy-dry-run
mise run web:deploy
```

主站复用现有 `vite-react-template` Worker 与 www 自定义域；源码来自 `apps/web`，不再提供原 Vite 占位页。正式环境由 login 写入父域随机会话标识，所有 Loom 子域都属于同一会话信任范围；D1 保存加密状态和撤销标记，退出先撤销再删除共享 Cookie。本地使用明确配置的 localhost 地址，不设置正式父域；Cookie 不按端口隔离，两应用需使用相同会话配置和数据库才能验证共享会话。部署本轮代码前先应用 identity 的 `0002_sessions.sql`；14 天内清除 Cookie、主动退出、上游失效或安全异常仍可能要求重登。

首页只模拟 Loom AI 的固定工作计划，不调用真实模型或外部工具。用户登录主站后，到 checkout 完成 USD 1.00 Sandbox 单次测试付款，再返回工作区刷新权益并运行 Pro 演示。每次受保护操作均重新查询服务端权益；全额退款后拒绝继续访问。当前只支持测试付款。

## Python workspace

根 `pyproject.toml` 不声明应用 package。uv workspace 包含 `apps/python` 与 `packages/python/*`，共用根 `uv.lock` 和 `.venv`；应用通过 `workspace = true` 引用 `hotkey-tools-core`。成员自行声明运行依赖和构建后端，开发工具集中在根依赖组。

```bash
mise run python-sync
mise run python-lock
mise exec -- uv tree --locked --depth 1
mise exec -- uv run --locked --all-packages pytest
```

`uv run --package` 选择依赖环境，不改变工作目录。Wrangler 的 Python 命令须在应用目录执行，因此优先使用对应 mise 入口。Python Worker 的 `pylock.toml`、`.venv-workers` 服务于 Pyodide/WASM，不替代根开发锁；启动或部署前会同步发布依赖并打包共享库源码。参考 [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/)和 [Python Workers FastAPI](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)。
