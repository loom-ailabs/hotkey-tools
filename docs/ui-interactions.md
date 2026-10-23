# Loom 页面交互与组件选择

## 目标

登录、购买与产品页保持同一品牌体验。公开内容提供中文和英文的服务端 HTML；账户操作可通过鼠标、触屏和键盘完成。此轮不增加产品能力、真实模型调用或新的付费项目。

## 登录页

参考用户提供的 Modal 登录页截图，采用左侧品牌与社交登录、右侧独立展示面板的双栏结构。选择官方 [shadcn/ui login-02](https://ui.shadcn.com/blocks/login) 的页面组织方式：它适合将身份操作与产品介绍分开；比单卡片登录多出品牌空间，又不需要增加邮箱密码表单。

登录按钮复用共享 Button；错误与配置提示复用 Alert。右侧使用基于 Embla 的 [shadcn/ui Carousel](https://ui.shadcn.com/docs/components/radix/carousel)，展示三组 SVG 动态占位插画。动效仅用于表达跨工具连接、上下文延续与想法成形的愿景，不是实时产品运行状态。轮播提供手动分页和暂停；键盘聚焦、用户暂停和减少动态效果设置均限制自动播放。

移动端优先保留品牌、语言/主题控制与登录操作，展示面板按可用空间重排。Logo 使用 loom-box 的原始品牌资源；单色标在浅色模式保留深色、深色模式反色，并以透明度控制层级。

## 账户菜单

头像使用 [shadcn/ui Avatar](https://ui.shadcn.com/docs/components/radix/avatar) 对应的 Radix primitive。仅将经过验证的当前用户资料交给浏览器；头像只接受不含用户名、密码的 HTTPS URL，并限制长度。不使用服务端代理获取用户图片，图片请求不发送页面 Referer；图片未提供或加载失败时显示名称首字。

下拉菜单使用 [shadcn/ui Dropdown Menu](https://ui.shadcn.com/docs/components/radix/dropdown-menu) 对应的 Radix primitive，复用其焦点管理、Esc 关闭、方向键导航与单选子菜单。菜单显示姓名、邮箱和当前方案，提供个人信息、外观、语言与退出操作。个人信息使用真实 `/account`、`/en/account` 路径，禁止索引且不进入站点地图。

退出仍提交同源 POST `/api/auth/logout`，沿用 D1 撤销、父域 Cookie 清理和 Logto 登出流程。菜单仅改变入口呈现，不另建客户端注销机制。

## 外观主题

采用 [shadcn/ui 的 Next.js 深色模式方案](https://ui.shadcn.com/docs/dark-mode/next)，使用 next-themes 提供浅色、深色和跟随系统。默认保持 Loom 深色品牌主题；共享语义颜色仍集中在 `packages/ui/src/styles/globals.css`。

`LOOM_THEME` 仅保存 `light`、`dark` 或 `system`，以父域、Path=/、一年有效期、SameSite=Lax 保存；HTTPS 下启用 Secure。布局读取有效偏好提供初始值，客户端在回到窗口时同步其他子域修改。该 Cookie 是可由脚本读取的外观偏好，不承载身份或权限，退出登录不删除用户的外观选择。

## 多语言

具体方案与边界见 [internationalization.md](internationalization.md)。主题和语言选择使用共享的偏好菜单，登录流程、回调与 API 路径不添加语言前缀。中英文文案分别维护，业务判断始终使用稳定错误类型与状态值，不以翻译文案决定分支。

## 验证记录

本地与线上验证结果由本轮发布记录补充；不能将组件存在、编译通过或动效示意当作完整交互验收。

### 2026-10-23 已发布验收

| 项目                       | 结果                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare WWW Worker      | `vite-react-template`，版本 `adf65f87-b42b-49e1-a9af-05249d60494b`，www.loom-labs.ai                                                                            |
| Cloudflare Identity Worker | `hotkey-tools-identity`，版本 `9462df3d-b3ec-4cd9-b11e-525e9d969d21`，login / checkout.loom-labs.ai                                                             |
| 工程检查                   | `mise run verify` 通过；后续偏好同步与页面缓存收紧也完成定向复测、格式检查和最终 OpenNext 构建                                                                  |
| 相关测试                   | identity-core 253、identity 148、web 27、i18n 8，共 436 项通过                                                                                                  |
| 实际本地 Workerd           | 51 项双语 HTTP + 6 项补充路由/缓存检查通过；共享会话 9 组通过，使用隔离 D1 和合成身份                                                                           |
| 线上独立 HTTP              | 51 + 6 项通过；私有 API、非法返回地址、伪造回调与会话仍拒绝访问                                                                                                 |
| 真实浏览器                 | GitHub 登录返回原 `/en/workspace` 路径及原查询；有效会话直接返回；头像加载、个人信息、三种主题、中英文菜单与跨子域偏好正常；键盘 Enter 打开、Esc 关闭并恢复焦点 |
| 统一退出                   | 通过头像菜单提交退出，www / login / checkout 三域均变为匿名；重新登录后三域恢复同一用户，付费权限仍为未解锁                                                     |
| 订单与权益                 | users=1、orders=6、entitlements=3、active=0、Stripe events=12，前后保持一致；本轮无新付款                                                                       |
| 凭据扫描                   | 240 个源码文件、15,284 个生成文件，4 类实际凭据精确扫描，0 处匹配                                                                                               |

发布复用现有两个 Worker、域名、D1 和 Logto 开发应用；没有新增收费资源或更改 Google 账号关联。外部 Stripe 托管界面沿用浏览器语言，此轮只保证自有购买页的中英文。

本地证据保存在忽略目录 `.codex-artifacts/experience/`：`local-public.json`、`local-extra.json`、`online-public.json`、`online-extra.json`、`online-billing-state.json`、`browser-e2e.json` 和不含凭据的页面截图。验收时未模拟等待新的 14 天；会话绝对期限与真实刷新证据另见 [session-lifecycle.md](session-lifecycle.md)。
