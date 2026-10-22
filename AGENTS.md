# 项目工作约定

本文件是 hotkey-tools 的仓库级工程规范。修改代码前先阅读；子目录存在更具体的 `AGENTS.md` 时，同时遵守。用户当次明确要求优先。

本规范参考 evals-grader 的 Evals Admin 前端技术栈、Feature-Sliced Design、Next.js 服务端边界、共享 UI 和验证约定，并按本仓库的 Cloudflare、Logto、Stripe 与 Python workspace 实际情况调整。不要照搬该项目的业务模块、内部基础设施、端口或未安装技能路径。

## 当前目标与应用边界

- 在 `apps/identity` 实现账户与购买应用，跑通 Logto Cloud 登录、Stripe Sandbox 单次购买、D1 权益记录和服务端鉴权。
- 所有新增 Web 应用统一使用 **Next.js 全栈应用**：页面与业务 API 位于同一应用、同一服务和同一域名。每个产品在 `apps/<产品名>` 下拥有独立应用与 package。
- 使用 App Router 承载页面，使用 `src/app/api/**/route.ts` 承载 HTTP API；应用业务逻辑放在本应用的 `src/server`。不要为同一个 Web 产品再新增独立 Hono、Express 网关或另一套 BFF。
- Cloudflare 通过 OpenNext 将该 Next.js 应用部署为一个 Worker，同时提供页面、静态资源和 API。需要登录或动态 API 的应用不得设置 `output: "export"`。
- `apps/web` 与 `apps/worker` 保留为既有静态 Web/网关示例；它们不作为新认证、支付和产品 API 的落点。默认产品开发入口使用 `apps/identity`。
- `apps/python` 与 `packages/python/*` 保持既有 uv workspace 边界。只有明确需要 Python 的能力才由独立 Python Worker 提供；用户身份、订单和权益判断仍由 Next.js 服务负责。
- 应用不能导入另一应用的实现。业务类型与接口定义先留在实际所有者中，多个活跃消费者确实需要共享时，再提取职责明确的 package。
- 仓库根目录只管理 workspace、工具链与任务，不承载应用代码，不声明根 Python package。

## 技术栈与工具

- Web：Next.js 16、React 19、TypeScript strict、Tailwind CSS 4。
- UI：本仓库 `packages/ui` 中的 shadcn/ui 风格基础组件、统一主题变量和 `cn()`；图标使用 `lucide-react`。
- 持久化：Cloudflare D1；认证使用已发布的 Logto 官方 Next.js SDK；支付使用 Stripe 官方 SDK 与托管 Checkout。
- 测试：Vitest；React 交互测试按需使用 Testing Library 与 happy-dom；数据库状态和事务测试使用实际 SQL 执行环境。
- 格式与静态检查使用 **Oxlint、Oxfmt**。不要添加 ESLint 或 Prettier 配置与依赖。
- mise 管理项目固定的 Node.js、pnpm、Python、uv 和 Wrangler CLI 版本。Identity 使用 `mise identity <命令>`（对应 `mise run identity:<命令>`）作为统一入口，临时命令使用 `mise exec -- ...`，不修改全局工具版本。
- Wrangler CLI 由 `.mise.toml` 的 `npm:wrangler` 固定版本；OpenNext 的 Node API、运行时验证及 pywrangler 的内部调用仍需要 package 中的 Wrangler 依赖，必须使用与 mise 相同的精确版本，不再分别声明版本范围。升级时同步修改 mise、相关 package 与 pnpm 锁文件。
- `package.json` 与 `turbo.json` 管理 package 任务图，`.mise.toml` 提供项目入口；初始化逻辑集中于 `scripts/setup.sh`，重复运行不得覆盖已有密钥或重置数据。
- 框架、SDK 与 OpenNext 的版本必须相互兼容；新增依赖直接声明在使用它的 package。不能把锁文件中的传递依赖视为可直接导入的依赖。
- 表单确实需要复杂校验时再加入 React Hook Form 与 Zod；只有跨组件共享的客户端状态才引入 Zustand。简单局部状态使用 React 本身。

## 前端目录与依赖方向

采用 Feature-Sliced Design，按实际需要创建 slice，不预建空目录：

```text
apps/identity/src/
  app/                    # Next.js page/layout/route 等框架适配
  _app/                   # 可选：FSD App 层，providers 与应用组合
  _pages/                 # 产品页面组合
  widgets/                # 可选：独立、完整的界面区块
  features/               # 登录、购买、查询订单等用户操作
  entities/               # 可选：用户、订单、权益等前端领域对象
  shared/                 # 浏览器安全的通用 API 客户端、配置与基础能力
  server/                 # 仅服务端代码：认证、支付、权益、数据库与 SDK 适配
```

- 前端依赖方向为 `App → Pages → Widgets → Features → Entities → Shared`。下层不得依赖上层，同层不同 slice 不直接导入内部实现。
- `src/app` 是 Next.js 适配层，不是 FSD App 层。为避免框架保留目录冲突，FSD Pages 使用 `_pages`，FSD App 使用 `_app`。
- 保留标准的 `page.tsx`、`layout.tsx`、`route.ts` 命名；确需请求拦截时使用 Next.js 16 的 `src/proxy.ts`。不得通过修改 `pageExtensions` 绕开架构边界。
- 页面只负责组合。支付流程、轮询、请求重试及其他业务状态放在相应 feature 的 model/hooks/API 中。
- slice 对外通过 `index.ts` 暴露公共接口；其他 slice 不越过公共入口访问内部文件。
- `shared` 只包含不带产品业务规则的通用能力。订单定价、身份归属、权益规则不能藏在通用 `utils`、`helpers` 或 `manager` 中。
- 客户端代码不得导入 `src/server`、Cloudflare bindings、数据库或支付/认证密钥。服务端模块使用 `server-only` 防止误入客户端构建。
- 浏览器安全的请求/响应类型与服务端实现分开；前端不能通过类型导入间接耦合服务端 SDK。

## UI 与交互约定

- 组件选择顺序：本仓库 `packages/ui` → 官方 shadcn/ui 合适组件 → 有明确必要性的产品自定义组件。
- 新增基础组件前先检查现有组件和 shadcn/ui 官方文档。通用 primitive 放在 `packages/ui` 并公开导出，产品组合留在所属应用。
- `packages/ui/src/styles/globals.css` 是共享主题变量的唯一来源；业务代码使用语义颜色、圆角与 Tailwind 默认 spacing/typography utilities。
- 不在产品组件中硬编码 hex/rgba 颜色、任意圆角、间距或字号；不另造重复 token 体系。
- 使用 Tailwind utilities 与 `cn()` 组合样式。不要新增 CSS Modules、styled-components、Emotion、组件局部样式或内联 style 对象。
- 点击控件使用语义化 `button`、`a[href]` 等，非禁用状态显示 pointer；同时提供键盘焦点、禁用、加载、空态和错误反馈。
- 页面需要适配移动端与桌面端。保留可读的排版层级、合理对比度、表单标签与必要的 `aria` 属性。
- 用户界面使用自然中文，SDK、协议、代码标识符和必要产品名保持原文。工程配置和实现细节放在开发文档，不挤入普通产品流程。

## Next.js 服务端与 HTTP API

- Route Handler 只做输入解析、调用服务、映射响应；跨步骤业务流程放在 `src/server` 对应模块。
- 数据库、外部 SDK 与 Cloudflare bindings 只能由服务端访问；在服务端明确处理配置缺失、外部超时和失败恢复。
- OpenNext 下使用 Next.js Node.js runtime 与 `nodejs_compat`，不设置 `runtime = "edge"`。通过官方适配获取 D1 binding。
- 不使用进程内 Map、全局变量或本机文件作为会话、订单或权益的权威存储。
- 环境变量、HTTP 输入和外部数据在边界处解析校验；有明确运行时校验需求时使用维护良好的 schema 库，避免同一数据在各层重复解析。
- URL 路径段、路径参数与 query 使用 `snake_case`，JSON 字段使用 `camelCase`。
- 自有 JSON API 使用统一响应格式；登录跳转与供应商明确规定的协议响应按其协议处理。

成功响应：

```json
{ "code": 0, "msg": "success", "data": {} }
```

失败响应：

```json
{ "code": 10001, "msg": "Safe readable reason", "error": { "type": "stable_error_type" } }
```

- 成功不包含 `error`，失败不包含 `data`；HTTP status 仍正确区分成功、客户端和服务端错误。
- 业务码为应用内唯一、稳定的正整数，集中登记在 `src/server/http-codes.ts`；客户端依据 `code` 判断，不能依据 `msg` 文案分支。
- 通用浏览器请求客户端放在 `src/shared/api`，统一处理响应格式、HTTP 错误和安全错误展示。
- 用户资料、订单、会话、权益与付费 API 使用 `private, no-store`，不能进入共享缓存。
- 错误返回不得泄漏凭据、SQL 或外部供应商原始响应。服务端保留经过必要脱敏的 stack/cause 诊断，不记录会话 Cookie、令牌、支付原始请求体或敏感用户资料。

## 登录、支付与鉴权规则

- 首版：Logto Cloud Free + Google/GitHub 登录，Stripe Sandbox 单次购买，D1 管理产品权益。
- 使用已发布的官方 Next.js SDK，回调验证 state、PKCE、issuer、audience 和签名；不能把 JWT decode 当作认证校验。
- 后续请求必须验证会话在服务端的有效期，不能只依赖浏览器 Cookie 的 `Max-Age`。过期会话要求重新登录，除非已明确实现并验证安全续期。
- 用户归属来自受校验会话中的稳定身份。保留 `(issuer, subject)` 映射，不以邮箱匹配订单或自动合并账号。
- 不把 ID Token 当作通用业务 API access token；不依赖 Logto 付费 RBAC/API resources 才能实现首版付费鉴权。
- 浏览器写操作检查配置的准确 Origin；Stripe Webhook 按原文与签名认证，不能要求用户登录或套用浏览器 Origin 校验。
- 商品、Price、金额、币种与数量由服务端确定。先持久化本地订单，再使用稳定幂等键创建 Checkout。
- 默认拒绝 Stripe Live 密钥、Live Price 和 Live 事件；在明确扩展与验收前，仅允许 Sandbox。
- 只有服务端核实支付成功后才发放权益，成功页参数不能授予权限。
- Webhook 必须原文验签、事件去重、容忍重复及乱序；事件处理标记、订单更新与权益变更原子提交。处理失败必须可重试。
- 权益按来源订单独立管理。确认成功全额退款后撤回对应订单权益，迟到成功事件不能恢复；其他有效订单仍可支撑使用权限。
- 每次受保护操作检查当前权益。只隐藏按钮、长期缓存 `isPaid` 或把付费状态写入长期 Cookie/JWT，均不能代替服务端鉴权。
- D1 是订单与权益的权威存储，KV 只承载可容忍传播延迟的缓存或配置。
- 测试与生产密钥、Webhook 密钥、回调域名和数据库分开配置；密钥不进入 `NEXT_PUBLIC_*`、源码、生成页面或提交记录。

## 代码质量与验证

- 修改前检查当前代码、manifest、锁文件和现有约定；生态行为不明确时先查对应版本的官方文档与维护中的实现。
- 按业务职责命名文件与模块，保持一个行为的单一实现；不保留无必要的 V1/V2、临时兼容路径或重复业务规则。
- 单文件尽量控制在 400 行内，超过 600 行前按职责拆分；不要靠压缩排版满足行数要求。
- 数据库变更新增 migration，不修改已经应用的迁移；迁移、回滚和恢复路径必须可说明。
- 测试覆盖可观察行为、边界条件、状态转换和故障恢复，不写只重复实现的镜像测试。
- 认证、支付、权益及 HTTP 边界的适用测试必须覆盖正常与拒绝路径；核心业务覆盖率目标为 statements、branches、functions、lines 均至少 90%。不通过排除未测业务模块或忽略失败分支达标。
- 必测行为包括会话过期、未登录/未购买、跨用户订单访问、来源检查、伪造回调、重复及乱序事件、事务失败重试、全额退款和多订单权益隔离。
- HTTP、SQL 和 UI 交互采用适合该边界的单元/集成测试；样式与静态配置不需要为覆盖率编造无效测试。
- 先运行受影响 package 的类型、lint、测试与构建，再根据共享模块和任务入口的变化扩展验证。
- 较大变更交付前运行 `mise run verify`；新应用还需要实际 HTTP smoke 与 OpenNext/Workers 本地预览验证。
- `next build`、OpenNext build、Wrangler dry-run、本地预览、真实第三方联调和云端部署是不同证据。没有配置真实 Logto/Stripe 账号、远端 D1 与域名时，明确报告尚未验证的部分。
- 不覆盖其他未提交改动，不自行提交或推送；用户要求提交时使用 Conventional Commits，并确保相关检查通过。
- 不提交 `.next`、`.open-next`、`.wrangler`、`dist`、coverage、本地环境文件、令牌和密钥。

## 命令入口

```bash
mise run setup
mise identity dev
mise identity build
mise identity preview
mise identity test
mise identity coverage
mise identity verify
mise identity deploy-dry-run
mise identity db-create
mise identity db-migrate
mise identity deploy
mise identity wrangler --version
mise run verify
```

Cloudflare 首次部署需要真实 D1 ID、远端迁移与 Secret 配置。使用 `mise identity db-create`、`mise identity db-migrate` 和 `mise identity deploy`；不能将占位 UUID 或未配置凭据的 dry-run 描述为生产可用。`mise identity build` 生成 Next.js 与 OpenNext/Workers 产物；`mise identity deploy-dry-run` 构建并检查打包，实际发布只由 `deploy` 执行。
