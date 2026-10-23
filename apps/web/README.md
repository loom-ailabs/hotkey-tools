# Loom AI 产品首页与工作区

`www.loom-labs.ai` 是独立 Next.js/OpenNext Worker，提供英文默认路径 `/`、`/vision`、`/pricing`、`/workspace`、对应中文 `/zh` 路径与同源 API。工作区提供人工整理的静态工作计划，不调用模型、创建文件或执行外部操作，不使用 Hash 路由；界面采用正式产品措辞，购买处保留真实的测试支付说明。

登录统一由 `login.loom-labs.ai` 发起，经 `auth.loom-labs.ai` 的 Logto 完成。WWW、checkout、login 使用同一 D1、app ID、endpoint、原 identity 密钥与固定租户命名空间。生产 Cookie `__Secure-loom_sid_<appId>` 只保存随机会话标识，设置 `Domain=.loom-labs.ai; Path=/; HttpOnly; Secure; SameSite=Lax`；SDK 令牌状态加密保存在 D1。10 分钟登录流程使用相同属性的 `__Secure-loom_flow_<appId>`。

会话从成功回调起最多保留 14 天，刷新短期令牌不会延长该截止时间。服务端按需通过官方 SDK 自动刷新，并重新检查身份，页面和 RSC 不需要重写 Cookie。刷新结果不确定或租约过期时拒绝继续使用；清除 Cookie、退出或上游失效也可能在 14 天前要求登录。旧自包含父域 Cookie 和 `logto_<appId>` 主机 Cookie 不再接受，已有用户需一次重新登录；详见[会话生命周期](../../docs/session-lifecycle.md)。

产品登录带完整 `returnTo` 路径和 query；已有有效会话时中央入口直接返回产品，匿名用户选择 Google/GitHub。只接受 HTTPS 的规范 `*.loom-labs.ai`，排除 login/auth、用户信息、非标准端口与 hash。无显式目标时，同产品 Referer 可保留初始未水合链接的路径；其他来源使用固定 `/workspace`。

共享实现位于 `packages/identity-core`，通过官方 Node/edge SDK 处理 OIDC 与刷新，Next cookies 只读写随机标识；D1 是可撤销会话的权威存储。WWW 不加载 Stripe SDK 或密钥。购买仍在 checkout，回到 WWW 后实时查询同一份 D1 权益。

## 中英文、外观与个人信息

英文默认使用原四个公开页面路径，中文使用对应 `/zh` 路径，均可直接访问与刷新。旧 `/en` 页面地址保留原始 query 并规范跳转到对应英文根路径。`/account`、`/zh/account` 提供当前用户信息并禁止索引，不进入公开站点地图。头像菜单包含个人信息、浅色/深色/跟随系统、中文/English 与退出；头像外框为 28px（边框内图片 26px）、点击范围为 40px，四项菜单图标均为 16px，不作为身份或付费授权依据。

`ProductAccessProvider` 放在布局中，导航和工作区共享同一账号状态，客户端页面切换不会重建读取。首次完整加载读取一次；不因 focus、visibility、定时器或路由变化自动同步，导航也不显示“Syncing”。用户手动刷新状态或完整重载可更新快照；功能操作仍以服务端当前会话与权益为准，导航快照不授予权限。

`packages/i18n` 管理 next-intl 路由和消息，`packages/ui` 管理外观与菜单组件。`LOOM_LOCALE`、`LOOM_THEME` 只记录非敏感偏好，生产共享父域；它们与 HttpOnly 登录会话分开。页面协商和偏好相关 SSR 使用 `private,no-store`，公开 sitemap、robots、llms 文本保持独立；API 与认证回调不加语言前缀。详见[国际化说明](../../docs/internationalization.md)。

## 本地运行

复制 `.env.example` 为 `.env.local` 与 `.dev.vars`。真实密钥只填写 `.dev.vars`；`.env.local` 的密钥保持空值，OpenNext 会把 dotenv 值编进 Worker。构建前 guard 会拒绝在 dotenv 中放置 Secret/Token/API key。

两应用使用相同 Logto app secret、原 identity Cookie secret、endpoint 和 namespace。WWW `APP_URL=http://localhost:3000`，统一 `LOGIN_URL=http://localhost:3001`，`AUTH_SUCCESS_URL=http://localhost:3000/`。本地 `LOGTO_COOKIE_DOMAIN` 留空，localhost 两端口自然共享 Cookie；不要配置不同密钥。Next 会把环回 IP 标准化为 localhost，因此不以 127.0.0.1 绕过。

Logto app 的本地回调为 `http://localhost:3001/api/auth/callback`；退出地址登记两产品根路径。

```bash
mise identity preview
mise run web:preview
mise run web:smoke
mise run web:coverage
mise run web:deploy-dry-run
```

预览清空生产自定义路由，只使用本地 SQLite，不执行远端迁移。迁移历史由 identity 管理，两应用绑定同一远端 D1。标准本地 preview 各有独立本地数据文件；共享数据库运输验证使用临时公共 persist 目录，不能将本地状态当作远端权益。

## API 与部署

JSON 统一 `{code:0,msg:"success",data}` / `{code:正整数,msg,error:{type}}`，均为 private/no-store 且 noindex。`GET /api/me` 返回 `{user:{id,name?,email?,picture?}|null,entitlements:{premium:boolean}}`。`GET /api/premium` 每次验证会话和 D1：匿名 401、无有效授权 403、有授权 200 `{unlocked:true,message}`。`POST /api/auth/logout` 只接受本产品准确 Origin，先撤销 D1 共享会话，再尽力撤销上游令牌，finally 清 Cookie，最终 303 登出；不因共享 Cookie 而放宽 CORS/CSRF。当前 SID 的复制件在撤销后也失效，刷新或已知关联流程的迟到回调不能使其恢复；不宣称退出其他设备或撤销无关联的独立新授权。

部署复用既有 Worker `vite-react-template` 与 WWW 自定义域。公开 Variables 包括 APP_URL、LOGIN_URL、AUTH_SUCCESS_URL、LOGTO_ENDPOINT、LOGTO_USER_NAMESPACE、LOGTO_APP_ID、LOGTO_COOKIE_DOMAIN；Secret 仅 LOGTO_APP_SECRET 和与 identity 相同的 LOGTO_COOKIE_SECRET，不包含 Stripe。后者作为 D1 状态加密的密钥派生输入保留。部署本轮代码前先由 identity 应用 `0002_sessions.sql`，两应用必须绑定同一份会话数据库。真正 OIDC 回调只登记中央 `https://login.loom-labs.ai/api/auth/callback`，其他旧回调暂留登记但产品服务拒绝非中央主机回调。

父域会话发送给所有子域，须将其视为同一信任域。端到端验收仍须使用真实浏览器证明登录、跨产品识别、支付、退款撤权和共享退出；构建与合成 Cookie 运输测试各有独立证据边界。

## 验证状态

本轮英文默认、正式产品文案、导航状态复用与图标调整已发布。全仓 `mise run verify` 返回 0；identity-core 263、identity 149、web 32、i18n 10，共 454 项通过，旧 Worker 4 项另计。本地实际 Workerd 共享会话 9/9、本地 HTTP 67/67、线上独立 HTTP 67/67 通过。WWW 当前版本为 `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0`，identity 为 `17aeae33-1ab4-450e-af1e-074e7a690576`，部署读回均为 100% 流量。公开正文、八个双语 URL、旧 `/en` 查询保留跳转、私有页面与 API 拒绝边界均已核对。

真实浏览器验证 GitHub 完整返回 `/workspace?source=login-polish&keep=a%2Bb`；客户端从愿景进入工作区不重复读取 `/api/me`，本地手动刷新增加一次读取。菜单图标、头像点击范围、居中登录与默认自动轮播均已检查。Google 已经官方账号选择和 Logto 回调进入 WWW，识别为此前同一身份；Logto 用户设置只读显示既有 GitHub、Google 连接，本轮未执行关联、合并或连接编辑。Google 登录后三域识别同一用户且 premium=false，随后统一退出后三域均匿名；再次 GitHub 登录返回 WWW 根路径成功。以下版本及测试保留为历史。

此前认证 checkpoint：WWW 版本为 `3b1091f9-a959-4352-91ac-54b6f0731811`，identity 为 `9e04b462-53e1-4660-8636-3c13139b00cc`，会话迁移已应用。当时 400 项测试、全仓验证、实际 Workerd 协议检查与线上匿名 53/53 通过；真实 GitHub 三域同一身份、返回原路径和 query、官方 SDK 刷新及共享退出已核对。受控缩短测试会话截止后拒绝认证，重登恢复同一身份，未宣称实际等待 14 天。该会话机制继续沿用，详见[会话生命周期](../../docs/session-lifecycle.md)。

### 上一版本已完成的验收（2026-10-23）

该历史版本的 WWW 为 `c7fbf7c8-c45a-45e5-b6d2-7ae7c15a0b85`；登录与购买 Worker 为 `a4224f5a-c2f1-427f-87c5-2fb94f03cce2`。

- 全仓 `mise run verify` 通过；本地 Workerd 的 19 项 HTTP 检查与 8 组父域 Cookie 运输检查通过。运输检查使用本地测试密钥和数据库，不代替真实第三方登录。
- 线上匿名检查 60/60 通过，检查前后远端数据不变；公开页面可直接打开和刷新，无 Hash 页面入口。
- 真实 GitHub 登录后，WWW、login、checkout 识别同一用户。中央入口已有会话时直接返回原产品路径与查询；从 WWW 退出后，三域均恢复匿名。
- USD 1.00 Sandbox 付款后，返回 WWW 可运行预置演示；退出重登仍保留权益。随后全额退款，原登录用户的高级接口返回 `premium_required`，工作区不再展示计划。
- Google Search Console 已完成 HTML 所有权验证，站点图已成功处理并发现四页；生成式 AI 搜索继承父域“包含”。这不代表搜索索引或排名已完成。

当前仍使用 Logto 开发租户与 Stripe Sandbox；Google 登录的本轮结果见上方当前验收，历史关联页记录不再代表当前未验。完整操作记录与 Sandbox 验证步骤见[飞书文档](https://bytedance.larkoffice.com/docx/O5IUdAY2bon0L1x72gucn73NnOh)；SEO 与 AI 阅读入口见[专项说明](../../docs/seo-geo.md)。
