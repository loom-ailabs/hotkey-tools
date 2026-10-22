# Loom AI 产品首页与工作区

`www.loom-labs.ai` 是独立 Next.js/OpenNext Worker，提供真实可刷新路径 `/`、`/vision`、`/pricing`、`/workspace` 与同源 API。工作区为固定示例计划，不调用真实模型，不使用 hash 路由。

登录统一由 `login.loom-labs.ai` 发起，经 `auth.loom-labs.ai` 的 Logto 完成。WWW、checkout、login 使用同一 app ID、endpoint、原 identity Cookie 密钥与固定租户命名空间，共享 `Domain=.loom-labs.ai` 的 HttpOnly、Secure、SameSite=Lax Cookie。Cookie 新名称为 `__Secure-loom_session_<appId>`，旧主机 Cookie 不再读取；已有用户首次需重新登录。

产品登录带完整 `returnTo` 路径和 query；已有有效会话时中央入口直接返回产品，匿名用户选择 Google/GitHub。只接受 HTTPS 的规范 `*.loom-labs.ai`，排除 login/auth、用户信息、非标准端口与 hash。无显式目标时，同产品 Referer 可保留初始未水合链接的路径；其他来源使用固定 `/workspace`。

共享实现位于 `packages/identity-core`，通过官方 Node/edge SDK 与公开 CookieStorage 接入 Next cookies；WWW 不加载 Stripe SDK 或密钥。购买仍在 checkout，回到 WWW 后实时查询同一份 D1 权益。

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

JSON 统一 `{code:0,msg:"success",data}` / `{code:正整数,msg,error:{type}}`，均为 private/no-store 且 noindex。`GET /api/me` 返回 `{user:{id,name?,email?}|null,entitlements:{premium:boolean}}`。`GET /api/premium` 每次验证会话和 D1：匿名 401、无有效授权 403、有授权 200 `{unlocked:true,message}`。`POST /api/auth/logout` 只接受本产品准确 Origin，清共享 Cookie 并通过 Logto 退出；不因共享 Cookie 而放宽 CORS/CSRF。

部署复用既有 Worker `vite-react-template` 与 WWW 自定义域。公开 Variables 包括 APP_URL、LOGIN_URL、AUTH_SUCCESS_URL、LOGTO_ENDPOINT、LOGTO_USER_NAMESPACE、LOGTO_APP_ID、LOGTO_COOKIE_DOMAIN；Secret 仅 LOGTO_APP_SECRET 和与 identity 相同的 LOGTO_COOKIE_SECRET，不包含 Stripe。真正 OIDC 回调只登记中央 `https://login.loom-labs.ai/api/auth/callback`，其他旧回调暂留登记但产品服务拒绝非中央主机回调。

父域会话发送给所有子域，须将其视为同一信任域。端到端验收仍须使用真实浏览器证明登录、跨产品识别、支付、退款撤权和共享退出；构建与合成 Cookie 运输测试各有独立证据边界。

## 已完成的验收（2026-10-23）

本轮已发布至既有 WWW Worker，版本为 `c7fbf7c8-c45a-45e5-b6d2-7ae7c15a0b85`；登录与购买 Worker 版本为 `a4224f5a-c2f1-427f-87c5-2fb94f03cce2`。

- 全仓 `mise run verify` 通过；本地 Workerd 的 19 项 HTTP 检查与 8 组父域 Cookie 运输检查通过。运输检查使用本地测试密钥和数据库，不代替真实第三方登录。
- 线上匿名检查 60/60 通过，检查前后远端数据不变；公开页面可直接打开和刷新，无 Hash 页面入口。
- 真实 GitHub 登录后，WWW、login、checkout 识别同一用户。中央入口已有会话时直接返回原产品路径与查询；从 WWW 退出后，三域均恢复匿名。
- USD 1.00 Sandbox 付款后，返回 WWW 可运行预置演示；退出重登仍保留权益。随后全额退款，原登录用户的高级接口返回 `premium_required`，工作区不再展示计划。
- Google Search Console 已完成 HTML 所有权验证，站点图已成功处理并发现四页；生成式 AI 搜索继承父域“包含”。这不代表搜索索引或排名已完成。

当前仍使用 Logto 开发租户与 Stripe Sandbox。Google 同邮箱身份按用户选择未关联，没有把 Google 应用回调记为已完成验收。完整操作记录与 Sandbox 验证步骤见[飞书文档](https://bytedance.larkoffice.com/docx/O5IUdAY2bon0L1x72gucn73NnOh)；SEO 与 AI 阅读入口见[专项说明](../../docs/seo-geo.md)。
