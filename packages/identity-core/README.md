# Identity core

WWW 与账户/购买应用共用的服务端实现；不包含 Cloudflare binding 获取或 Stripe 客户端。

- `session` 使用官方 `@logto/node/edge` 与公开 `CookieStorage`，只适配 Next cookies 读写。官方 SDK 负责 state、PKCE、issuer、audience、签名及协议流程，不修改 SDK 或自行实现 OIDC。
- 生产 Cookie 为 `__Secure-loom_session_<appId>`，设置 `Domain=.loom-labs.ai`、`Path=/`、HttpOnly、Secure、SameSite=Lax。WWW、checkout 与 login 共用原 identity 密钥、app ID、endpoint、租户命名空间。旧 `logto_<appId>` 主机 Cookie 不再读取，避免同名遮蔽；退出时删除正确父域 Cookie 并清理当前主机旧 Cookie。
- `auth` 检查受保护会话中的 `exp/sub`，过期后要求重新登录；不静默续期。用户写入固定租户命名空间，不能按邮箱合并。
- `auth-routes` 统一在 LOGIN_URL 发起与完成 OIDC。有效共享会话直接返回受信产品；显式 `returnTo` 保存于 SDK 加密登录状态，回调重新验证。
- `return-target` 仅接受 HTTPS 的规范 `*.loom-labs.ai`、默认 443、无用户信息，排除 login/auth 主机，不接受 apex、混淆域名或任何 hash。保留合法路径和原 query。开发仅允许显式登记的 loopback origin。
- `entitlements` 每次查 D1 当前有效订单授权，不缓存付费状态；各应用写 API 仍验证自己的准确 Origin。
- `http` / `http-codes` 提供统一安全响应与脱敏诊断；`contract` 仅包含浏览器安全类型。

父域 Cookie 会发送给同一信任域内的所有子域（也包括 auth）；这些服务必须按同一会话信任边界管理。共享退出后所有产品后续请求都失去该会话，已经显示的页面需刷新状态。已有独立 Cookie 被新名称替代，需要首次重新登录。

生产固定 `LOGTO_USER_NAMESPACE=https://kpy72v.logto.app`；它不是 OIDC issuer 的替代品，SDK 仍从当前 endpoint 发现并校验实际 issuer。本地统一 localhost，两端口使用同一密钥，Cookie 不设置 Domain；不能用端口隔离同名 Cookie。

```bash
mise exec -- pnpm --filter @hotkey-tools/identity-core test:coverage
```

核心四项覆盖率门槛均为 90%；权益使用真实 SQLite 查询，支付事务与实际迁移测试归 `apps/identity`。CookieStorage 合成测试验证运输和加密隔离，不等于真实供应商登录证据。
