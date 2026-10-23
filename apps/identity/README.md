# Identity：账户与购买应用

本应用将页面、登录回调、订单 API、Stripe Webhook 和付费鉴权放在同一个 Next.js App Router 服务中，通过 OpenNext 部署到一个 Cloudflare Worker，提供 Loom 账号管理与一次性解锁工作计划的访问权限。数据库标识继续沿用 `hotkey-tools` / `premium-demo`，不改既有订单、幂等或权益归属；不包含订阅、用量计费或独立身份签发服务。

Logto 负责认证和短期令牌刷新，D1 保存可撤销会话、用户、订单和权益，Stripe Sandbox 负责测试付款。付费权限由业务数据库判断，不依赖 Logto 的 RBAC 或自定义 API resources。开发租户可用功能不能代替生产 Free 套餐的验证。

## 中英文与外观

登录与购买页面默认英文根路径，中文使用 `/zh`；旧 `/en` 页面保留原始 query 并规范跳转到英文根路径。登录操作区居中，右侧产品愿景轮播默认自动播放，可视控制只保留分页点，键盘聚焦可操作暂停/播放，并遵循减少动态效果设置。购买页使用账号、访问权限和一次性解锁等正式措辞，购买位置明确显示测试支付、不真实扣款；工作计划仍为主站人工整理的静态内容。

界面使用共享浅色、深色、跟随系统与语言偏好，购买页沿用现有订单与权益逻辑。生产 `LOOM_LOCALE`、`LOOM_THEME` 只保存非敏感偏好，与 HttpOnly 随机会话标识分开；identity 所有语言页面仍禁止索引。

`/api/auth/login`、callback、订单与 Stripe Webhook 保持原端点，不带语言前缀。有效语言偏好只通过官方 SDK 的固定 `ui_locales=zh-CN|en` 影响托管登录界面，不改变身份验证或返回地址校验。消息和布局接线见[国际化说明](../../docs/internationalization.md)；主站头像菜单和个人信息页由 `apps/web` 承载。

## 本地启动

在仓库根目录完成初始化：

```bash
mise run setup
mise identity dev
```

默认地址为 `http://localhost:3001`。也可运行 `mise run dev-identity`；两者启动同一个应用。开发入口会先应用本地 D1 migrations。页面可在未配置供应商时打开，登录和支付相关服务会返回清晰的 503 状态。

日常操作统一使用 `mise identity <命令>`，也支持 `mise run identity:<命令>`：

```bash
mise identity help
mise identity build             # Next.js 构建 + OpenNext/Workers 产物
mise identity preview           # 本地 Workers runtime，端口 3001
mise identity test
mise identity coverage
mise identity check-session     # 真实 SDK 的 Workerd 协议运行时验证
mise identity verify            # 类型、lint、覆盖率、JWT 运行时、构建与打包
mise identity deploy-dry-run    # 实际构建和打包，不发布
mise identity wrangler --version
```

Wrangler CLI 由 mise 安装并固定版本；OpenNext 的 Node API 与运行时检查仍使用 package 中相同精确版本的依赖。查看部署命令而不执行构建或发布，使用 `mise run --dry-run identity:deploy`。

环境文件：

- `apps/identity/.env.local`：仅公开的 Next.js 本地配置，密钥项保持为空。
- `apps/identity/.dev.vars`：Next.js/OpenNext 本地绑定与真实本地密钥。
- 两个文件均由 `setup` 在缺失时从 `.env.example` 创建，不会覆盖已有内容，且已被 Git 忽略。
- 服务端优先读取 OpenNext/Workers bindings 中的非空值，再使用进程环境。避免两个本地文件中保留不一致的非空配置。

## 配置项

| 名称                    | 用途                                                                                                                                 | 配置位置                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `APP_URL`               | 本应用的准确访问 origin，如本地 `http://localhost:3001` 或已部署的 HTTPS origin；不要带路径、query 或 fragment                       | 本地环境文件；远端 Worker Variable |
| `LOGIN_URL`             | 统一认证 origin，作为 SDK baseUrl 和唯一 OIDC 回调主机；该精确主机展示登录页                                                         | 本地环境文件；远端 Worker Variable |
| `AUTH_SUCCESS_URL`      | 网站默认返回地址的可信根 origin（默认使用其 /workspace）；正式地址使用 HTTPS，本地 loopback 可用 HTTP；未配置时使用 `APP_URL` 根地址 | 本地环境文件；远端 Worker Variable |
| `LOGTO_ENDPOINT`        | Logto 租户访问地址，不带额外 `/oidc` 路径                                                                                            | 本地环境文件；远端 Worker Variable |
| `LOGTO_USER_NAMESPACE`  | 本地用户表使用的固定租户标识；未设置时沿用 `LOGTO_ENDPOINT`，切换该租户域名前必须显式固定原值                                        | 本地环境文件；远端 Worker Variable |
| `LOGTO_APP_ID`          | Logto Traditional web 应用 ID                                                                                                        | 本地环境文件；远端 Worker Variable |
| `LOGTO_APP_SECRET`      | 同一应用的客户端密钥                                                                                                                 | 仅 `.dev.vars`；远端 Worker Secret |
| `LOGTO_COOKIE_DOMAIN`   | 生产固定 `.loom-labs.ai`；本地 localhost 留空                                                                                        | 本地公开配置；远端 Worker Variable |
| `LOGTO_COOKIE_SECRET`   | 至少 32 字符的随机密钥输入，用于派生 D1 会话状态加密密钥；共享应用、重启和重新部署时保持一致                                         | 仅 `.dev.vars`；远端 Worker Secret |
| `STRIPE_SECRET_KEY`     | 与商品、Price、Webhook 同一 Sandbox 的 `sk_test_` 密钥                                                                               | 仅 `.dev.vars`；远端 Worker Secret |
| `STRIPE_WEBHOOK_SECRET` | 当前回调目标对应的 `whsec_` 签名密钥；CLI 转发与远端 endpoint 的密钥不同                                                             | 仅 `.dev.vars`；远端 Worker Secret |
| `STRIPE_PRICE_ID`       | Sandbox 中启用的、金额大于零的一次性固定 Price                                                                                       | 本地环境文件；远端 Worker Variable |
| `DB`                    | D1 binding，不是连接字符串                                                                                                           | `wrangler.jsonc` 的 `d1_databases` |

可用 `openssl rand -base64 32` 生成 Cookie 密钥，再保存至本地文件或 Secret。不要提交实际凭据、将它们放入 `NEXT_PUBLIC_*`，或在命令行参数、页面、截图和日志中展示密钥。根 `.env` 不替代应用配置。

## Logto 应用与上游身份源

### 应用接入 Logto

在 Logto 租户创建 **Traditional web** 类型的自有应用，将应用 ID、应用密钥和租户 endpoint 填入上述配置。本应用的两项登记地址为：

| Logto 应用字段             | 地址                             |
| -------------------------- | -------------------------------- |
| Redirect URI               | `${LOGIN_URL}/api/auth/callback` |
| Post sign-out redirect URI | `${APP_URL}/`                    |

本地和远端回调分别登记。SDK 的 baseUrl 统一使用 `LOGIN_URL`，生产回调为 `https://login.loom-labs.ai/api/auth/callback`，不从 Host 推导。产品 `/api/auth/login` 303 到中央登录页；`returnTo` 仅允许 HTTPS 规范 `*.loom-labs.ai`，排除 login/auth、userinfo、非标准端口及 hash，保留路径和原 query。已有有效共享会话直接回产品；匿名用户使用固定 Google/GitHub provider。目标保存在 D1 中加密的官方 SDK 登录状态中，浏览器只持有 10 分钟流程标识；回调验证 state、PKCE、issuer、audience 和签名后再验证目标。旧 `destination=website|checkout` 仅兼容固定目标，未知或重复参数拒绝。客户端不能指定任意 IdP target。

### 自定义域名与原用户归属

当前公开配置如下。login 与 checkout 绑定本 Worker，auth 是已就绪的 Logto 自定义域名。GitHub 返回、付款开通、退出重登持权及全额退款撤权已有历史验收；本轮 GitHub 与 Google 均已真实完成中央回调并进入 WWW。

```dotenv
APP_URL=https://checkout.loom-labs.ai
LOGIN_URL=https://login.loom-labs.ai
AUTH_SUCCESS_URL=https://www.loom-labs.ai/
LOGTO_ENDPOINT=https://auth.loom-labs.ai
LOGTO_USER_NAMESPACE=https://kpy72v.logto.app
```

`login.loom-labs.ai` 与 `checkout.loom-labs.ai` 绑定本 Worker：前者展示统一登录页、发起与接收唯一 OIDC 回调，后者展示账户和购买页。`auth.loom-labs.ai` 是 Logto 托管认证，`www.loom-labs.ai` 由 apps/web 提供产品页面。所有产品进入 login，并携带经校验的完整 returnTo 路径及 query；有效共享会话直接回产品。Google/GitHub 的上游 connector 回调仍登记 Logto auth 域，不能与本应用 login 回调混淆。

协议验证与刷新由官方 `@logto/node/edge` 完成；Next cookies 只运输随机标识。生产会话 Cookie 为 `__Secure-loom_sid_<appId>`，流程 Cookie 为 `__Secure-loom_flow_<appId>`，均设置 `Domain=.loom-labs.ai; Path=/; HttpOnly; Secure; SameSite=Lax`。WWW/checkout/login 共用 D1、原 identity key、app ID、endpoint 与 namespace；令牌和 SDK 状态加密保存在 D1。父域 Cookie 会到达所有子域，应视为同一信任域。Stripe Webhook 继续原文验签，不受登录跳转影响；支付后固定返回 `https://www.loom-labs.ai/workspace`。

这次从自包含 Cookie 切换到 D1 会话：旧 `__Secure-loom_session_<appId>` 和 host-only `logto_<appId>` 均不再作为登录依据，已有用户需要一次重新登录。退出清理同 Domain/Path 的新旧父域 Cookie，以及当前 host 的旧 Cookie。原 `LOGTO_COOKIE_SECRET` 保留为服务端密钥派生输入，不能将其写入浏览器。

同一个 Logto 租户切换访问域名时，必须保持 `LOGTO_APP_ID`、Cookie 密钥及 `LOGTO_USER_NAMESPACE` 稳定。现有用户的 `users.issuer` 已保存原 endpoint，因此本租户固定为 `https://kpy72v.logto.app`，无需改写数据库或重新关联订单。该字段现在表示固定的本地身份命名空间；实际 OIDC issuer 仍由 SDK 从当前 endpoint 的 discovery 获取并校验。命名空间只能用于同一个已确认租户，不能用于自动合并其他租户；不按邮箱匹配用户。未固定命名空间而直接换域可能触发用户主键冲突，应用会拒绝请求。

### Google/GitHub 接入 Logto

这一层使用另一组 OAuth 凭据和回调：**Google/GitHub → Logto**。已登录 Logto 管理台或创建开发租户，并不表示该租户已具备社交登录凭据。

1. 在 Google Cloud 或 GitHub 创建自己控制的 OAuth 应用，取得对应 Client ID 和 Client Secret。
2. 在 Logto 的 Social connectors 中添加 Google/GitHub，填写供应商凭据。
3. 复制该 connector 显示的 Callback URI，登记到对应供应商的应用中。这里填写的是 **Logto 的 connector 回调**，不是本应用的 `/api/auth/callback`。
4. 在 Logto 的 Sign-up and sign-in 中启用已配置的 connector，保存后再测试登录按钮。

本次 Google/GitHub 均已登记 auth.loom-labs.ai 下的 connector 回调，默认 kpy72v.logto.app 回调保留作备用。两供应商均已保存 auth 与默认备用回调，并清理临时 login.loom-labs.ai 回调；Logto 中该临时域名映射也已移除，不作为有效入口。

Google 的测试受众需要包含实际测试账号；所需设置以该 OAuth 应用的受众、发布状态和 scope 为准。已有 Google OAuth client 可在允许的情况下新增 Logto 回调；GitHub OAuth App 按当前控制台登记准确回调，不覆盖其他应用仍在使用的地址，并禁用 wildcard。不要假定不同类型或版本的供应商应用具有相同的回调数量限制。

本次 Google/GitHub 演示 connector 均已替换为自有专用凭据。其他开发租户若提供标记为“演示”的 connector，可按控制台说明用于开发验证。公开登录配置中的 `socialConnectors: []` 只说明当前未启用社交登录，不证明控制台不存在演示连接器。演示连接器不可用于生产，应按控制台提示在测试后删除或替换为自己控制的凭据；不保证每个租户都预置演示凭据。

供应商 OAuth secrets 保存在 **Logto connector** 中，本应用不另设 `GOOGLE_CLIENT_SECRET` 或 `GITHUB_CLIENT_SECRET`。使用专用 OAuth 应用时，仍需完成上述供应商配置步骤。参考 [Google connector](https://docs.logto.io/integrations/google)、[GitHub connector](https://docs.logto.io/integrations/github)和[社交登录启用步骤](https://docs.logto.io/connectors/social-connectors)。

Logto 开发/生产租户由用户预先创建，本次仅配置开发租户，生产租户未改动。Google OAuth 测试受众中本次新增 1 名自用账号，Google/GitHub 演示连接器均已替换为专用配置；GitHub 已在新旧入口完成真实登录。

早期 Google 测试曾到达同邮箱账号的显式关联页，并按用户选择停止该分支。本轮 Google 已从官方账号选择、Logto 回调进入 WWW，应用识别为此前同一身份；Logto 用户设置的只读检查显示已有 GitHub 与 Google 连接。本轮未执行关联、合并或连接编辑，不能据此声称本轮创建了连接，也不以邮箱自动合并账号。 Google 登录后三域均识别同一用户且 premium=false，随后统一退出后三域匿名；再次 GitHub 登录已返回 WWW 根路径。

托管页面已在开发租户保存浅深主色、Dark mode 与 [Custom CSS](../../docs/logto-branding.css)；真实 GitHub 回调已观察到内联 CSS 和 Loom 加载装饰。原生 Company logo/Favicon 字段本轮未配置，开发环境提示与 Powered by Logto 保留。配置范围和回滚见[Logto 品牌配置](../../docs/logto-branding.md)。

开发租户包含开发标识和用户数据保留限制，不作为生产用户库。正式上线应单独核实套餐、配额和迁移安排。参考 [Logto 租户说明](https://docs.logto.io/logto-cloud/tenant-settings)。

### 会话边界

成功回调创建固定 14 天的 D1 应用会话，截止时间不随访问或令牌刷新延长。登录中的流程状态只有 10 分钟。`auth_sessions` 只保存随机 SID 的 SHA-256 哈希与 HKDF/AES-GCM 加密的 SDK 状态；浏览器不持有 ID、access 或 refresh token。

请求先检查 D1 会话未到期、未撤销，再读取身份声明。身份令牌或 access token 剩余有效期不超过 60 秒，或 access token 缓存缺失、异常时，服务端通过官方 SDK 的 `clearAccessToken()` / `getAccessToken()` 刷新，重新读取并校验身份；RSC 无需写 Cookie。跨 Worker 刷新使用 D1 `first-primary`、版本比较更新及 30 秒租约，每个 SDK 请求最多 5 秒，协议操作总计最多 20 秒。等待活跃租约超出上限返回 `session_busy`；租约过期或刷新结果不确定时撤销会话，避免重放可能已消耗的 refresh token。

退出登录仅接受准确同源的 POST，先撤销 D1 中当前会话及关联流程，再由 SDK 尽力撤销上游 refresh token；适配层在 finally 中清除 Cookie，最终以 303 执行 Logto 登出。已撤销 SID 的复制件不能在后续请求中恢复会话；并发刷新和已知关联流程的迟到回调也不能重新启用它。统一退出作用于当前 Cookie 标识的共享会话与流程，不是用户所有设备，也不撤销无关联的独立新授权；已开始执行的业务操作不会被倒退取消。

14 天是应用允许的最长绝对期限，不是无条件免登录承诺。清除 Cookie、主动退出、上游令牌失效、密钥或 endpoint 变化，以及安全异常都可能提前要求重新登录。尚未接入 Logto 控制台禁用用户的实时回通道。应用使用稳定的 `(租户命名空间, subject)` 记录用户，不以邮箱关联购买；ID Token 不作为通用业务 API 的 bearer token。详细设计、迁移与验证边界见[会话生命周期](../../docs/session-lifecycle.md)。

## Stripe Sandbox 单次购买

在同一个 Stripe Sandbox 中创建商品及启用的一次性固定 Price，配置 Secret Key 和 Price ID。本期仅接受 `sk_test_`、测试 Price、测试 Session/PaymentIntent 和测试事件；Live 配置会被拒绝。

购买流程：

1. 已登录用户发起 Checkout，客户端仅提交 UUID `requestId`，失败重试复用同一个值。
2. 服务端从会话取得用户，读取并校验 Price，先在 D1 保存本地订单，再使用与订单绑定的幂等键创建 Checkout。
3. 托管收银台完成测试付款后，页面返回并查询本用户订单；最多查询 15 次、间隔 2 秒，失败或仍在处理中可点击“刷新状态”重试。
4. Webhook 验签后，服务端重新读取 Stripe 的 Session、PaymentIntent 和退款现状，核对订单归属、Price、金额、币种与数量，原子记录事件、订单及权益。
5. `/api/premium` 每次从服务端会话取得身份并查询 D1 有效权益。成功页 query、客户端用户 ID 或按钮状态都不能授予权限。

本期固定数量 1、仅卡支付，关闭优惠码、自动税及自动本地化定价。具体测试卡信息请使用 [Stripe 官方测试文档](https://docs.stripe.com/testing)，不要输入真实卡。

### Webhook

远端 Webhook 使用 `${APP_URL}/api/webhooks/stripe`。本次 endpoint 已从原 workers.dev 更新为 `https://checkout.loom-labs.ai/api/webhooks/stripe` 并回读确认；新 URL 的实际付款通知已被处理，订单与权益状态正确；成功全额退款后 D1 权益已撤回，原已登录会话的高级接口返回 premium_required。登记以下事件：

- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`
- `refund.created`
- `refund.updated`

使用该 endpoint 对应的签名密钥配置 `STRIPE_WEBHOOK_SECRET`。本地可用 Stripe CLI 将同一 Sandbox 的事件转发至 `http://localhost:3001/api/webhooks/stripe`，并使用 CLI 本次输出的签名密钥；不要与远端 endpoint 密钥混用。参考 [Stripe Webhook](https://docs.stripe.com/webhooks)。

Webhook 使用原始请求体和异步签名校验，不要求用户登录或浏览器 Origin。D1 事件处理标记与订单/权益变更在同一 batch 提交；失败返回错误，允许 Stripe 重送。已付款状态不会被迟到的过期事件覆盖。

### 退款和恢复

- 已成功退款金额累计达到原订单金额时，订单标记为 `refunded`，撤回这笔订单的权益。
- 部分退款、待处理或失败退款不撤回已有权益；本期没有按比例降级规则。
- 支付确认时也会重新检查成功退款，避免“退款先到、付款通知后到”重新开通。
- 权益按订单分别保存；一笔退款不会撤回其他有效订单支撑的权限。
- 本期没有应用内退款按钮或定时对账服务。退款在 Stripe Sandbox 中发起，问题事件可在 Stripe 中检查并重送；页面刷新只查询状态，不代替 Webhook 确认。

## 本地验证与 Workers 预览

```bash
mise identity check-types
mise identity lint
mise identity test
mise identity coverage
mise identity build
mise identity preview
```

`next dev` 主要运行在 Node.js；`preview` 使用 `wrangler.jsonc` 的独立 `env.preview`，清空远端 Custom Domain routes，先执行该环境的本地 D1 迁移，再构建并以 `--env preview --local` 启动 Workers runtime，不对远端数据库应用迁移。

中央登录预览为 `http://localhost:3001`，WWW 为 `http://localhost:3000`。两应用本地使用相同 Cookie key 和 localhost（Domain 留空），统一 LOGIN_URL=localhost:3001、AUTH_SUCCESS_URL=localhost:3000。预览清空生产 routes，不放宽正式准确 Origin 检查；真实本地 OAuth 需登记中央 localhost:3001 回调。

本轮英文默认、正式产品文案、居中登录、默认自动轮播和菜单图标已发布。全仓 `mise run verify` 返回 0；identity-core 263、identity 149、web 32、i18n 10，共 454 项测试通过，旧 Worker 4 项另计。本地真实 Workerd 共享会话 9/9、本地 HTTP 67/67、线上独立 HTTP 67/67 通过。当前 identity 版本 `17aeae33-1ab4-450e-af1e-074e7a690576`、WWW 版本 `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0` 均已读回为 100% 流量；GitHub 完整返回 `/workspace?source=login-polish&keep=a%2Bb`，Google 也已完成真实应用回调并进入 WWW。以下版本与测试保留为历史。

此前 D1 会话认证 checkpoint：identity 为 `9e04b462-53e1-4660-8636-3c13139b00cc`，WWW 为 `3b1091f9-a959-4352-91ac-54b6f0731811`，`0002_sessions.sql` 已应用。当时 core 239、identity 137、WWW 24，共 400 项测试通过；core 覆盖率为 statements 98.17%、branches 95.47%、functions 100%、lines 98.75%。真实 GitHub 三域共享登录、官方 SDK 刷新、共享退出及受控绝对到期拒绝已验证；不将此称为真实等待 14 天。本地 Workerd 9 组通过。该会话机制继续沿用，证据见[会话生命周期](../../docs/session-lifecycle.md)。

以下是 2026-10-23 上一版自包含父域 Cookie 的真实记录：登录与购买 Worker 为 `a4224f5a-c2f1-427f-87c5-2fb94f03cce2`，WWW 为 `c7fbf7c8-c45a-45e5-b6d2-7ae7c15a0b85`。全仓验证、本地 Workerd 和 60 项线上匿名检查通过；真实 GitHub 三域共享登录、有效会话返回原产品、共享退出、USD 1.00 Sandbox 付款后主站运行、退出重登持权，以及全额退款后原会话拒绝访问均已完成。最终有效权益为 0；旧有两项 pending 购买意图未改动。浏览器和订单证据分别为 `shared-domain-browser-e2e.json` 与 `shared-domain-billing.json`，完整步骤与对象清单见[飞书操作记录](https://bytedance.larkoffice.com/docx/O5IUdAY2bon0L1x72gucn73NnOh)。

以下是此前独立会话方案的历史记录，不作为本轮父域共享会话的验收依据：当时域名方案已通过全仓 `mise run verify` 和 182 项测试；核心服务端/API 覆盖率为 statements 98.57%、branches 98.06%、functions 100%、lines 99.39%。Workers 本地预览、本地 D1 smoke、远端 D1 健康检查和 9 项匿名边界检查已通过。

旧 workers.dev 入口已完成 GitHub 登录、Sandbox 付款、重登持权及全额退款撤权，证据位于 `.codex-artifacts/identity/browser-e2e.json` 和 `cloud-e2e-billing.json`。

早期新域名版本已验证 GitHub 的 website/checkout 两种返回、USD 1.00 付款开通、退出重登持权，以及成功全额退款后的 D1 撤权和高级接口拒绝；当时 D1 用户数保持为 1。证据位于 `custom-domain-browser-e2e.json` 与 `custom-domain-billing.json`。该阶段的 Google 只验证至显式关联页；本轮已完成的 Google 应用回调结果见上文。

适配 Logto SDK 时，Next.js 构建曾选择 jose 的 Node 导出，导致本次 Workerd 环境的 ES384 验签不兼容。现将直接依赖固定为 `jose@5.10.0`，开发与构建显式使用 webpack，并将精确的 `jose$` alias 指向该库官方 WebCrypto 导出；SDK 的签名、issuer 和 audience 校验保持启用。`scripts/check-jose-runtime.mjs` 已在 Workerd 验证合法 ES384 签名、篡改签名、错误 issuer、错误 audience 四项行为。该修复针对本次依赖与构建路径，不表示 Cloudflare 全面不支持 Node crypto。

真实联调至少检查：登录后 `/api/me` 取得当前用户；未登录访问高级接口为 401、未购买为 403；付款后关闭页面仍由 Webhook 开通；伪造成功页不能开通；重复事件不重复授予权益；成功全额退款撤回对应订单权益。会话还须检查跨产品自动刷新、刷新失败拒绝访问、退出后 SID 重放、并发刷新/退出，以及固定第 14 天边界；时间推进与合成协议测试不能称为真实等待 14 天的验证。

## Cloudflare 部署

`wrangler.jsonc` 的目标 Worker 名为 `loom-identity`，入口为 `.open-next/worker.js`，静态资源为 `.open-next/assets`，D1 binding 为 `DB`。D1 数据库仍名为 `hotkey-tools-identity`，其 ID、迁移命令和既有数据不随 Worker 更名。默认不配置 R2 缓存，动态用户数据不使用共享缓存。参考 [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)和 [OpenNext 配置](https://opennext.js.org/cloudflare/get-started)。

2026-10-23 已将 Cloudflare 中既有 `hotkey-tools-identity` Worker 原地更名为 `loom-identity`，本地 `name` 与云端一致。更名后回读确认既有部署仍承接 100% 流量，Secrets、D1 binding 及 `login.loom-labs.ai` / `checkout.loom-labs.ai` 自定义域名保留。后续类似迁移不要仅修改 `name` 后直接部署，以免创建另一 Worker；应先完成云端原地更名并回查绑定。Secrets 只核对名称，不输出值；不改会话密钥、Logto 参数、Stripe Webhook 或其他业务标识。

在仓库根目录执行：

```bash
mise identity login
mise identity status
mise identity db-create
```

将输出的真实 `database_id` 填入本应用 `wrangler.jsonc`。应用远端迁移：

```bash
mise identity db-migrate
```

首次尚未创建 Worker 时，可以先部署配置未完整的应用，页面将显示待配置；之后补齐配置并重新部署。不要因此把该次发布当作登录或付款已通过。

在 Worker Variables 中设置 `APP_URL`、`LOGTO_ENDPOINT`、`LOGTO_APP_ID`、`STRIPE_PRICE_ID`，按目标配置 `LOGIN_URL`、`AUTH_SUCCESS_URL` 与固定 `LOGTO_USER_NAMESPACE`；在 Worker Secrets 中分别设置四项密钥，也可用下列交互命令逐个输入：

```bash
mise identity wrangler secret put LOGTO_APP_SECRET
mise identity wrangler secret put LOGTO_COOKIE_SECRET
mise identity wrangler secret put STRIPE_SECRET_KEY
mise identity wrangler secret put STRIPE_WEBHOOK_SECRET
```

本应用 APP_URL 为 checkout，WWW 的 APP_URL 为 www，仅用于各自页面/API 与准确 Origin 检查。两应用 SDK baseUrl 统一 LOGIN_URL=login，OIDC 回调仅在 login；共享 Cookie Domain=.loom-labs.ai、D1、app ID、原 identity key、endpoint 和 namespace 全部一致。先应用 `0002_sessions.sql`，再部署两应用，避免新版本缺少会话表；旧 Cookie 不会迁移，需一次重新登录。Stripe endpoint 继续指向 checkout，付款和退款协议不变。之后运行：

```bash
mise identity deploy
```

远端首次部署前须确认迁移、Variables 和 Secrets 都已设置。应用的远端迁移/部署命令会拒绝全零数据库 UUID；`deploy:dry-run` 只检查打包，不创建资源或验证供应商账号。以免费资源运行的可行性仍需核实实际 Worker 包大小、CPU 和账户配额；项目不会自动升级套餐。

## 数据与接口

`migrations/0001_identity.sql` 包含 `users`、`orders`、`entitlements`、`stripe_events`；`0002_sessions.sql` 新增 `auth_sessions`，保存加密 SDK 状态、固定截止时间、撤销标记、刷新版本/租约与流程关联。后续新增 migration，不修改已应用的文件。本地和远端数据库相互独立；不要将远端资源误当成本地测试库。

| 路由                        | 行为                                                     |
| --------------------------- | -------------------------------------------------------- |
| `GET /api/health`           | 检查 D1 binding 和迁移后的表                             |
| `GET /api/auth/login`       | 产品跳中央页；中央允许固定 provider 和受信 returnTo      |
| `GET /api/auth/callback`    | SDK 校验后仅返回受信产品路径与 query，拒绝 hash          |
| `POST /api/auth/logout`     | 同源；D1 撤销会话、清 Cookie，再 303 登出                |
| `GET /api/me`               | 当前用户与 `{ premium }` 权益；匿名用户返回 `user: null` |
| `POST /api/checkout`        | 同源、已登录；创建或恢复该用户的购买尝试                 |
| `GET /api/orders/:id`       | 仅返回当前用户的订单                                     |
| `GET /api/premium`          | 要求已登录且存在有效权益                                 |
| `POST /api/webhooks/stripe` | 原文验签、处理测试事件及权益                             |

自有 JSON API 成功返回 `{ code: 0, msg: "success", data }`，失败返回 `{ code, msg, error: { type } }` 并保留相应 HTTP status；业务码集中在 `src/server/http-codes.ts`。私有数据响应使用 `private, no-store`。登录跳转按 OIDC 流程返回，不套 JSON 格式。

前端由 `_pages/identity` 组合 `features/manage-access`，共享请求解析位于 `shared/api`，通用组件和主题位于根 `packages/ui`；浏览器不导入 `src/server`。

### 本地密钥与构建产物

真实 Logto / Stripe 密钥只存于已忽略的 `.dev.vars`，生产使用 Cloudflare Secret。`.env.local` 仅填写公开配置，其密钥项保持为空：OpenNext 1.20 会把 `.env*` 的值编入 Worker；`.dev.vars` 不参与这份编译，Next 开发通过 Cloudflare binding 获取其中的本地密钥。不要将真实凭据复制回 `.env.local`。构建前的 `check-worker-env.mjs` 会检查仓库根和应用的各模式 dotenv 文件，发现非空密钥配置即拒绝构建；只打印文件及变量名。
