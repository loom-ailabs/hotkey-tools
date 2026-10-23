# 共享会话与 14 天自动刷新

本轮将自包含加密 Cookie 改为 D1 管理的可撤销会话。产品继续共享 `.loom-labs.ai` 下的登录状态，认证协议与短期令牌刷新仍由官方 `@logto/node/edge` 完成。应用不自行签发身份令牌，也不将 ID Token 当作业务 API 的 bearer token。

## 期限与用户体验

| 对象     | 期限与行为                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 应用会话 | 成功 OIDC 回调时创建，固定 14 天绝对期限。访问、刷新令牌和切换产品均不推迟截止时间。                                       |
| 登录流程 | 10 分钟，保存官方 SDK 的 state、PKCE 和返回地址状态；回调只能消费一次。                                                    |
| 短期令牌 | 身份令牌或 access token 剩余有效期不超过 60 秒，或 access token 缓存缺失、异常时，由请求触发服务端刷新；无须用户手动登录。 |
| 重新登录 | 会话绝对到期、撤销、浏览器清除 Cookie、上游令牌失效或刷新安全异常时需要；14 天不是无条件免登录承诺。                       |

`login.loom-labs.ai` 统一发起和完成 OIDC。产品带合法 `returnTo` 进入登录页；共享会话有效时立即返回原路径及 query。返回地址只接受规范 HTTPS 受信产品子域，拒绝外域、apex、login/auth、用户信息、非标准端口和 hash。Google 同邮箱账号仍按用户选择保持未关联，不自动合并身份。

## 浏览器、D1 与 SDK 的职责

浏览器保存两项 Cookie，均不含身份声明或令牌：

| Cookie                       | 内容                 | 正式属性                                                                           |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `__Secure-loom_sid_<appId>`  | 32 字节随机会话标识  | `Domain=.loom-labs.ai; Path=/; HttpOnly; Secure; SameSite=Lax`，到期与 D1 会话一致 |
| `__Secure-loom_flow_<appId>` | 独立随机登录流程标识 | 相同属性，10 分钟，回调后删除                                                      |

本地使用 `loom_sid_<appId>` / `loom_flow_<appId>`，不加 Secure 前缀或正式 Domain。Cookie 不按端口隔离；两个本地应用要共享同一数据库和认证配置，分别预览的数据文件不能冒充共享数据库。

`auth_sessions` 由 `apps/identity/migrations/0002_sessions.sql` 创建。D1 只保存 SID 的 SHA-256 哈希，不保存可直接重放的原始 SID。官方 SDK 状态由原 `LOGTO_COOKIE_SECRET` 经 HKDF 派生的 AES-GCM 密钥加密，app ID、endpoint 与 SID 哈希绑定加密上下文。令牌和状态在服务端处理时解密，日志、页面、浏览器与普通 API 均不得暴露这些值。

每条记录保存用途、创建/截止时间、版本、刷新时间、撤销标记和刷新租约。流程记录还可关联它已创建的认证记录。服务端每次请求检查 D1 状态，不能仅凭 Cookie 存在或浏览器 `Max-Age` 认证。RSC 只需读取标识 Cookie；刷新状态写回 D1，不要求在 RSC 中写 Cookie。

父域 Cookie 会发送给该域下的子域，包括托管认证域；所有子域都必须按同一信任边界管理。HttpOnly 阻止脚本读取 Cookie，不能防止被攻陷的受信子域服务收到它。新增子域不得承载不受信内容。两 Worker 共用 D1、app ID、endpoint、固定用户命名空间与服务端密钥；WWW 不配置 Stripe 密钥。

## 自动刷新与并发控制

1. 通过 D1 `withSession("first-primary")` 开始读取，检查记录未撤销且未绝对到期，再解密 SDK 状态。
2. 身份声明和 access token 缓存仍充足时直接使用；否则以记录版本与 30 秒租约做条件更新，只有一个 Worker 能取得刷新权。
3. 持锁请求使用官方 SDK 公开的 `clearAccessToken()`、`getAccessToken()` 取得新令牌；SDK 验证新令牌，应用重新读取 claims 并检查有效期和 subject 一致。
4. SDK 写入先暂存，经版本、租约、未撤销和未到期条件校验后一次提交。截止时间保持不变；失败时不能留下半份新状态。

每个 SDK 请求最多 5 秒，整个协议操作最多 20 秒。其他请求等待活跃租约的时间有上限，超出后返回 `session_busy`，不另行使用旧 refresh token。30 秒租约过期时撤销记录，不接管可能已被上游消耗的旧状态。网络结果不确定、刷新验证失败或状态提交失败时撤销会话，并尽力撤销新取得的令牌；后续需重新登录。

协议 HTTP 只允许配置的 Logto origin，采用 Workerd 支持的 `redirect: "manual"`，拒绝 3xx，不跟随重定向或向其他地址传递凭据。`mise identity check-session` 使用实际 Workerd 和官方 SDK 回归此行为，且已纳入根验证入口。

刷新不能延长 14 天，也不代表订阅或付费权限续期。受保护业务操作仍须查询 D1 当前权益。

## 统一退出与迟到响应

退出只接受发起产品准确 Origin 的 POST，按以下顺序处理：

1. 在 D1 撤销当前 SID 和登录流程，清除密文；旧流程关联的已创建认证会话也一并失效。
2. 尽力通过官方 SDK 撤销 refresh token 并取得 Logto 登出地址；上游失败不撤回本地已完成的撤销。
3. 适配层在 finally 中按相同 Domain/Path 清除 SID、flow 和旧父域 Cookie，并清理当前主机的旧 `logto_<appId>` Cookie；最终响应以 303 跳转登出地址或受信返回地址。

退出与刷新并发时，刷新提交须再次满足“未撤销”条件，不能恢复会话。已知登录流程的回调响应即使迟到、重新写入一个 SID，该 SID 也会被 D1 撤销状态拒绝。开始新登录前还会先撤销 Cookie 指向的旧流程及其已创建的认证会话，避免旧回调在流程 Cookie 被替换后恢复登录。已复制的 SID 在撤销后的请求同样失效。

统一退出指当前 Cookie 标识的共享会话、已知登录流程及其创建的认证会话，不是用户所有设备或所有独立会话。两个没有旧 Cookie 关联的独立首次授权不被自动合并为一个浏览器会话。已经开始执行的业务操作无法倒退取消。尚未接入 Logto 控制台禁用用户的实时回通道；上游撤销的影响还取决于何时触发下一次刷新，不能宣传即时同步所有供应商状态。Logto 的 end-session 和 refresh token 撤销是不同步骤，仅跳转登出页不足以替代 D1 撤销。

## 迁移与密钥管理

- 先应用 `0002_sessions.sql`，再部署 identity 与 WWW。迁移不改用户、订单或权益归属。
- 新 SID 名称与旧 `__Secure-loom_session_<appId>` 隔离，旧自包含 Cookie 不再读取。已有用户需要一次重新登录；无需让旧 Cookie 自然过期才生效。
- 保留原 `LOGTO_COOKIE_SECRET` 作为服务端加密密钥输入。它和 app secret 仅存于 `.dev.vars` / Cloudflare Secrets，`.env.local` 密钥为空，构建前 guard 继续生效。
- 更改加密密钥、app ID 或 endpoint 会使旧状态无法使用。不要把固定用户命名空间当作解密上下文或 OIDC issuer 校验的替代品。
- 回滚不能重新接受旧自包含 Cookie，否则会绕过 D1 撤销。读取已过期记录时会标记撤销并将密文置空；未再次访问的过期记录及撤销墓碑仍需后续制定保留和清理策略，不能从索引或截止时间推断已自动删除。

## 本轮验证状态

2026-10-23 已应用 `0002_sessions.sql` 并发布两 Worker：identity 为 `9e04b462-53e1-4660-8636-3c13139b00cc`，WWW 为 `3b1091f9-a959-4352-91ac-54b6f0731811`。core 239、identity 137、WWW 24，共 400 项测试及全仓 `mise run verify` 通过；core 覆盖率为 statements 98.17%、branches 95.47%、functions 100%、lines 98.75%。实际 Workerd 协议检查及本地共享会话 9 组最终复跑通过；真实线上登录、SDK 刷新、退出、受控绝对到期拒绝与重登已完成。认证验收分支为 `feat/session-renewal`；本节不包含后续界面或中英能力改动。

| 验证边界      | 需要确认的行为                                                                        | 本轮状态                                                                                    |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 数据与加密    | 实际 SQL；只存 SID 哈希；密文篡改/换 key/换上下文拒绝；撤销清密文                     | 本地测试通过；远端迁移与退出后密文清空已核对                                                |
| 官方 SDK 协议 | 登录 state/PKCE；刷新验证；refresh token 轮换；错误 issuer/audience/签名/subject 拒绝 | 合成协议与实际 Workerd 回归通过；真实 Logto 刷新已通过                                      |
| 固定期限      | 成功回调起 14 天；刷新不延期；精确边界拒绝                                            | 本地精确边界通过；线上刷新保持截止时间，受控缩短测试会话截止后拒绝，未实际等待 14 天        |
| 并发与故障    | 多 Worker 一次刷新；超时/不确定结果；退出与刷新/回调竞争；撤销后 SID 重放             | 本地故障与竞争测试通过；真实共享退出后三域匿名                                              |
| 本地 Worker   | SDK 与 HTTP 传输在实际 Workerd 的行为                                                 | `mise identity check-session` 通过，拒绝 3xx 且不跟随；共享会话 9 组最终复跑通过            |
| 真实线上      | GitHub 回调、三域同一身份、真实 Logto 刷新、固定截止不变、共享退出                    | 已通过，含受控到期与重登；独立匿名 53/53，含流程 Cookie 的父域、安全属性与 10 分钟期限      |
| 业务回归      | 未购拒绝；供应商操作不改订单和权益                                                    | `premium_required` 已核对；本轮未新付款，用户 1、订单 6、权益 3（有效 0）、事件 12 保持不变 |

真实刷新采用可复现的受控方法：只清除本轮会话的 access token 缓存，不修改 JWT、refresh token 或截止时间。第一次工具更新使版本由 0 到 1，后续页面请求触发官方 SDK 的实际网络刷新并提交版本 2；身份令牌的 `exp` 从 1792730390 变为 1792730934，`refreshed_at` 已写入。`expires_at=1793936390766` 毫秒始终不变，与 `created_at` 差值恰为 14 天；续期后三域仍识别同一用户。它证明真实协议刷新和固定截止时间，不是等待短期令牌或 14 天自然耗尽的实验。

随后从 WWW 实际退出，三域 `/api/me` 均为匿名；D1 会话版本变为 3，撤销时间已写入，密文为空，数据库不再保留该会话的 refresh token。状态证据为 `renewal-status-2026-10-23T03-41-35.005Z.json`、`renewal-expire-cache-2026-10-23T03-47-37.723Z.json`、`renewal-status-2026-10-23T03-49-08.125Z.json`、`renewal-status-2026-10-23T03-51-52.705Z.json`；匿名边界见 `renewal-online-negative.json`。证据不包含原始 SID、令牌或个人邮箱。

线上绝对到期检查仅受控缩短本轮第二个测试会话的 `expires_at`，身份令牌当时仍有效。三域 `/api/me` 随后均为匿名；该记录版本 2、已撤销、密文为空且没有 refresh token，`refreshed_at` 仍为空，表明没有用刷新绕过应用会话期限。这不是实际等待 14 天，也不修改其他用户或历史会话。

之后真实 GitHub 重新登录创建新的活动会话，`created_at=1792728112455`、`expires_at=1793937712455` 毫秒，差值恰为 14 天，版本 0；三域恢复同一用户身份。最终业务计数保持用户 1、订单 6、权益 3（有效 0）、事件 12，未产生本轮新付款。汇总为 `renewal-browser-e2e.json`，到期和重登状态为 `renewal-status-2026-10-23T04-01-35.663Z.json`、`renewal-status-2026-10-23T04-02-57.027Z.json`；安全截图为 `renewal-final-online.png`。

上一版本的 Sandbox 付款退款、共享 Cookie 与 GSC 证据保留为历史，不用来代替本轮会话验收。本轮未新付款，也未重新验证 Google 同邮箱身份关联；该身份仍按用户选择不关联。

## 实现入口与官方依据

共享代码位于 `packages/identity-core/src/session*.ts`，认证服务位于 `auth.ts`，应用使用本地 D1 binding 注入数据库。验证以当前源码、实际 SQL、已安装 SDK 和运行证据为准。

- [Logto 平台 SDK 约定](https://docs.logto.io/developers/sdk-conventions/platform-sdk-convention)：SDK 管理令牌缓存与刷新；具体公开方法以项目固定的 `@logto/node@4.0.1` 为准。
- [Logto 退出机制](https://docs.logto.io/end-user-flows/sign-out)：应用退出、集中登录会话退出与 refresh token/grant 撤销分别处理，尤其不能把 `offline_access` 的 end-session 当作令牌已撤销。
- [Cloudflare D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)：`first-primary` 从主库开始并提供会话内顺序一致性；`batch()` 中的 SQL 以事务执行。它们是数据库机制，不代替本应用的版本与撤销条件。
