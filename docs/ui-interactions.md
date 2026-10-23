# Loom 页面交互与组件选择

## 目标

登录、购买与产品页保持同一品牌体验。英文为默认语言，使用根路径；中文使用 `/zh`，两者提供服务端 HTML。账户操作可通过鼠标、触屏和键盘完成。本轮调整文案、语言默认值、导航状态与登录展示，不增加真实模型调用或新的付费项目。

界面用账号、工作计划、一次性解锁和访问权限等产品措辞，不再以“示例”“Demo”“演示”称呼功能。工作计划目前仍是人工整理的静态内容，没有模型生成、文件创建或外部操作执行；措辞变化不代表新增能力。购买位置保留测试支付、不真实扣款和金额以收银台为准的说明。

## 登录页

参考用户提供的 Modal 登录页截图，采用左侧品牌与社交登录、右侧独立展示面板的双栏结构；登录操作区的标题、说明和按钮居中。选择官方 [shadcn/ui login-02](https://ui.shadcn.com/blocks/login) 的页面组织方式：它适合将身份操作与产品介绍分开；比单卡片登录多出品牌空间，又不需要增加邮箱密码表单。

登录按钮复用共享 Button；错误与配置提示复用 Alert。右侧使用基于 Embla 的 [shadcn/ui Carousel](https://ui.shadcn.com/docs/components/radix/carousel)，呈现三组 CSS/SVG 产品愿景图形，不代表实时任务状态。桌面页面可见且允许动态效果时默认每 7 秒轮播，可视控制仅保留分页指示点；点击指示点后仍按当前播放状态继续，拖动或悬停期间暂停。移除可见前后箭头和播放按钮，保留视觉隐藏、键盘聚焦时可显示的暂停/播放控件；键盘聚焦、用户暂停、隐藏页面和减少动态效果设置均限制自动播放。

移动端收起展示面板，优先保留品牌、语言/主题控制与登录操作。Logo 使用 loom-box 的原始品牌资源；单色标在浅色模式保留深色、深色模式反色，并以透明度控制层级。

## 账户菜单

头像使用 [shadcn/ui Avatar](https://ui.shadcn.com/docs/components/radix/avatar) 对应的 Radix primitive。仅将经过验证的当前用户资料交给浏览器；头像只接受不含用户名、密码的 HTTPS URL，并限制长度。不使用服务端代理获取用户图片，图片请求不发送页面 Referer；图片未提供或加载失败时显示名称首字。

下拉菜单使用 [shadcn/ui Dropdown Menu](https://ui.shadcn.com/docs/components/radix/dropdown-menu) 对应的 Radix primitive，复用其焦点管理、Esc 关闭、方向键导航与单选子菜单。导航头像外框为 28px，边框内图片为 26px，按钮保留 40px 点击范围；菜单显示姓名、邮箱和当前方案，提供个人信息、外观、语言与退出操作。个人信息使用英文 `/account`、中文 `/zh/account` 路径，禁止索引且不进入站点地图。

共享偏好菜单的外观与语言项分别使用 `Palette`、`Languages` 前置图标，与个人信息和退出两项图标统一为 16px。图标沿用 `lucide-react`，文字、键盘操作与单选状态保持完整，不以图标代替名称。

退出仍提交同源 POST `/api/auth/logout`，沿用 D1 撤销、父域 Cookie 清理和 Logto 登出流程。菜单仅改变入口呈现，不另建客户端注销机制。

## 导航账号状态

`ProductAccessProvider` 位于语言布局，导航和各产品页面共享一份状态，客户端路由切换时保留。首次完整页面加载只读取一次 `/api/me`；窗口 focus、visibility 变化、定时器和客户端路由切换均不触发自动同步。导航不显示“Syncing”或同类同步提示；已有头像不会因页面跳转而重复切换为加载状态。

用户可点击刷新状态，或完整重载以获取最新账号与权益。导航快照不授予权限：受保护操作仍向服务端验证会话与当前权益，并按操作结果更新页面。其他标签页的退出或退款不保证立即改变当前导航外观；服务器仍拒绝失效会话或已撤销权益。

## 外观主题

采用 [shadcn/ui 的 Next.js 深色模式方案](https://ui.shadcn.com/docs/dark-mode/next)，使用 next-themes 提供浅色、深色和跟随系统。默认保持 Loom 深色品牌主题；共享语义颜色仍集中在 `packages/ui/src/styles/globals.css`。

`LOOM_THEME` 仅保存 `light`、`dark` 或 `system`，以父域、Path=/、一年有效期、SameSite=Lax 保存；HTTPS 下启用 Secure。布局读取有效偏好提供初始值，客户端在回到窗口时同步其他子域的外观修改；这不触发账号数据重新读取。该 Cookie 是可由脚本读取的外观偏好，不承载身份或权限，退出登录不删除用户的外观选择。

Logto 托管认证页已在开发租户保存浅深主色、Dark mode 与 Custom CSS；只从有效外观 Cookie 传递官方 `theme=light|dark`。真实 GitHub 回调已观察到内联 CSS 和 Loom 加载装饰，原生 Company logo/Favicon 字段本轮未配置。开发环境提示与 Powered by Logto 保留，不能消除网络空白、重定向或控制身份源页面。范围、实际效果与回滚见[Logto 品牌配置](logto-branding.md)。

## 多语言

具体方案与边界见 [internationalization.md](internationalization.md)。英文默认使用无前缀路径，中文使用 `/zh`；旧 `/en` 页面保留 query 并规范跳转到对应英文地址。主题和语言选择使用共享偏好菜单，登录流程、回调与 API 路径不添加语言前缀。中英文文案分别维护，业务判断始终使用稳定错误类型与状态值，不以翻译文案决定分支。

## 验证记录

本轮默认英文、正式措辞、导航状态、菜单图标和登录轮播已发布并实际验收。下列当前记录与后续历史记录分开，不以组件存在或编译通过替代交互验证。

### 本轮发布验收（2026-10-23）

| 项目             | 结果                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工程检查         | 全仓 `mise run verify` 返回 0；identity-core 263、identity 149、web 32、i18n 10，共 454 项通过；旧 Worker 4 项另计                                                                                               |
| 实际本地 Workerd | 共享会话 9/9、HTTP 67/67 通过                                                                                                                                                                                    |
| 线上 HTTP        | 独立匿名检查 67/67；覆盖默认英文、中文 `/zh`、旧 `/en` 原始 query 跳转、八个公开 SSR/SEO 地址和私有入口拒绝边界，不使用真实浏览器 Cookie 或发起付款                                                              |
| Cloudflare 发布  | WWW `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0`；identity `17aeae33-1ab4-450e-af1e-074e7a690576`；部署读回均承接 100% 流量                                                                                            |
| 导航状态         | 本地和线上客户端页面切换不新增 `/api/me` 请求；本地手动刷新新增一次。导航保留账号外观，不显示同步文字；迟到功能响应不能覆盖较新的手动刷新结果                                                                    |
| 菜单和登录       | 头像外框 28px、内图 26px、按钮 40px，四项菜单图标均 16px；登录操作区居中，默认自动轮播，可视控制仅分页点                                                                                                         |
| 真实身份源       | GitHub 完整返回 `/workspace?source=login-polish&keep=a%2Bb`。Google 经账号选择和 Logto 回调进入 WWW，三域均识别为此前同一身份且 premium=false；只读检查显示 Logto 已有两种连接，本轮没有执行关联、合并或连接编辑 |
| 统一退出         | Google 登录后执行退出，三域 `/api/me` 均匿名且 premium=false；随后真实 GitHub 重登返回 WWW 根路径成功                                                                                                            |
| 托管品牌         | 开发租户已保存主色、Dark mode 和 CSS；浅色预览计算背景正确，真实 GitHub 加载页含内联 CSS，深色背景为 rgb(24,24,24)，Loom 加载装饰顶部 48px；原生 Logo/Favicon 字段未配置                                         |

本轮维护记录与不含个人资料的截图位于忽略目录 `.codex-artifacts/polish/`，包括 `verify-release.log`、`online-http-and-deployments.json`、`login-online-en.png`、`account-menu-online.png`、`logto-github-loading.png` 和 `logto-loading-final-dark.png`。付款、退款及 14 天真实刷新验收继续保留各自历史证据；本轮界面验证不替代新的支付测试，也不宣称实际等待 14 天。

### 上一轮双语发布的历史验收（2026-10-23）

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

该轮发布复用现有两个 Worker、域名、D1 和 Logto 开发应用，没有新增收费资源或更改 Google 账号关联。外部 Stripe 托管界面继续沿用浏览器语言；自有购买页的中英文不保证外部供应商页面同步。

本地证据保存在忽略目录 `.codex-artifacts/experience/`：`local-public.json`、`local-extra.json`、`online-public.json`、`online-extra.json`、`online-billing-state.json`、`browser-e2e.json` 和不含凭据的页面截图。验收时未模拟等待新的 14 天；会话绝对期限与真实刷新证据另见 [session-lifecycle.md](session-lifecycle.md)。
