# Loom Web 视觉系统

本轮采用统一的磨砂玻璃界面与原创数字编织主视觉，让首页、登录和购买流程保持连续的品牌层次，同时保证正文、账户操作和支付说明清晰可读。2026-10-23 已完成本轮代码检查、本地验证与线上发布；实际版本和验收范围见文末。绘制频率和分辨率上限是资源约束，不代表已测得的稳定帧率或功耗。

本方案延续[产品设计依据](loom-product-design.md)、[页面交互设计](ui-interactions.md)与[国际化规则](internationalization.md)。不改变登录协议、共享会话、付款模式、权益判断或现有页面路径，不因视觉升级宣称新增模型生成、自动执行或正式收款能力。

## 调研依据与取舍

调研于 2026-10-23 读取各项目的当前文档、公开源码和许可证，只参考提供方的一手资料。

首先区分来源：[shadcn/ui 官方说明](https://ui.shadcn.com/docs/official)将 `ui.shadcn.com` 与 `github.com/shadcn-ui/ui` 列为官方资源。用户参考的 `shadcn.io` 是独立社区服务，不能将它的组件、商业授权或质量声明归为 shadcn/ui 官方保证。

| 参考                                                                                                                                                                                                                  | 值得采用的视觉原则                                   | 本仓库的取舍                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [shadcn.io Glass Button](https://www.shadcn.io/button/glass-button)、[Glassmorphism Navbar](https://www.shadcn.io/blocks/navbar-glassmorphism)、[Sticky Blur Navbar](https://www.shadcn.io/blocks/navbar-sticky-blur) | 半透明表面、细边、局部背景模糊；滚动时保持导航可辨识 | 保留现有按钮和导航语义，自行实现表面。参考按钮基于 Base UI，导航示例使用 Framer Motion；不为视觉替换当前 Radix，也不复制受限 Pro Block                                                                                                                                                                                                                                                     |
| [SmoothUI Glass Card](https://smoothui.dev/docs/components/glass-card)                                                                                                                                                | 边缘高光、鼠标响应的柔和反光、装饰层与正文分离       | [源码为 MIT](https://github.com/educlopez/smoothui/blob/main/LICENSE)，但该组件依赖 `motion`，采用大量内联样式和自身颜色。参考层次与渐进增强，不照搬实现或为此新增动画依赖                                                                                                                                                                                                                 |
| [shadcn-glass-ui-library](https://github.com/artyhoo/shadcn-glass-ui-library)                                                                                                                                         | 通过语义变量统一玻璃强度、焦点与组件表面             | [v2.11.3 发布记录](https://github.com/artyhoo/shadcn-glass-ui-library/releases/tag/v2.11.3)提供近期维护证据；但 [LICENSE](https://github.com/artyhoo/shadcn-glass-ui-library/blob/main/LICENSE)为 Apache-2.0，[package.json](https://github.com/artyhoo/shadcn-glass-ui-library/blob/main/package.json)却标记 MIT。整包还包含 Framer Motion、Recharts、多组 Radix 与独立主题，不在本轮引入 |
| [Aceternity Liquid Glass](https://ui.aceternity.com/components/liquid-glass)                                                                                                                                          | 轻微曲面边缘、透明度降级、将复杂折射作为增强效果     | 官方明确 SVG backdrop 折射只在 Chromium 生效，Safari/Firefox 为磨砂效果；本轮不依赖这种折射。公开组件安装入口与 [Pro 授权](https://ui.aceternity.com/licence)应分别核实，不能将可见预览或 CLI 命令视为任意复制付费代码的许可                                                                                                                                                               |

[shadcn.io 普通组件条款](https://www.shadcn.io/terms)与 [Pro 许可](https://www.shadcn.io/license)分别规定使用范围，不能将普通组件说明推广到全部 Pro 内容。本轮不安装上述库、不下载或复制付费实现；使用现有 React、Radix、Tailwind 和浏览器绘图能力编写本仓库自己的组件。

普通 CSS `backdrop-filter` 已具备较广的现代浏览器支持，但旧浏览器仍可能不支持；SVG 过滤器引用又有不同限制。[MDN 的兼容说明](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)不能替代本仓库目标浏览器的实际检查。其他项目宣称的平滑、可访问或性能优化也只是参考，不是 Loom 的验收结果。

## 界面表面与视觉层级

玻璃用于表达前后关系，而不是让所有内容都透明。全站使用同一套浅色、深色与跟随系统规则，色值和材料变量只在[共享主题](../packages/ui/src/styles/globals.css)定义。产品组件只使用公开的语义 class、variant 和 token，不写局部颜色、内联 `style` 对象或另一套主题。

主题首帧由两应用布局与共享 [AppearanceProvider](../packages/ui/src/components/appearance-provider.tsx)共同处理。布局只读取枚举有效的 `LOOM_THEME`，在 SSR HTML 输出明确的 `light` / `dark` 类；无有效偏好默认深色，`system` 则由页面中的同步初始化脚本解析系统外观。[appearance-bootstrap.ts](../packages/ui/src/components/appearance-bootstrap.ts)生成自包含脚本文本，不捕获 Worker 构建器的 `__name` 等闭包辅助函数。原 next-themes 自序列化启动脚本以 `type="text/plain"` 保留但不执行，公开 ThemeProvider 运行时、React 接管页面后的交互与父域 Cookie 仍继续使用；未修改 SDK 源码，也未引入另一套主题状态。此策略避免 Worker 产物中的函数序列化依赖导致首帧脚本失效；已通过6项 SSR/VM 测试，以及本地和线上实际 HTML 的主题首帧检查。

- **页面基底**：稳定、低饱和的实色背景，保留足够留白。数字编织图形只占首页主视觉区域，不把全页变成持续运动的背景。
- **导航与浮层**：轻磨砂表面、细边和柔和高光。导航、头像菜单、下拉菜单共享材料与圆角，保留稳定尺寸和清晰焦点，不能随账户状态改变高度。
- **内容卡片**：以可读的表面和边框为主，少量透明度形成层次；只在重要内容使用稍强的高光。正文、价格、错误与账户信息不经过折射。
- **操作控件**：主要 CTA 保留足够实体感，次级按钮可使用玻璃表面。hover、focus-visible、disabled、loading 和 destructive 必须可区分，不仅依赖透明度或发光。

浅色模式的边缘通过表面亮度和边框建立，不能依赖深色模式才看得见的白色高光。深色模式延续当前 Loom Desktop 的语义角色；发光只作为装饰，不表示服务在线、付款成功或模型正在执行。语言切换不改变材料规则。

文字对比度按实际合成后的背景检查，不以半透明前景的原始色值推断。普通文字以 WCAG AA 的 4.5:1 为目标，大字号与必要界面边界按相应要求检查；实际检查结果待验收。菜单、按钮和链接继续采用现有原生/Radix 语义，不给装饰卡片增加多余焦点。

不支持模糊时使用实色表面和边框；减少透明度、强制颜色或高对比度环境下优先可读性。减少动态效果时保留材料和品牌，但关闭鼠标扭曲、漂移和持续脉动。触屏无需模拟悬停；必要状态不能只靠 hover 显示。

## 原创数字编织主视觉

首页以 Loom 的“连接与编织”表达为基础，由数字字符、微点与短线组成交织的带状场。它是本项目编写的装饰图形，不复制其他产品的 Logo、球体、付费 Shader 或组件预览内容。原有品牌资产继续承担识别职责，不能把粒子效果误标为实时数据或工作执行。

中央标题、说明和主要操作保留在正常 HTML 中，由 Next.js 输出可抓取正文；不能将标题或功能说明只画进 Canvas，也不能等待动画初始化才显示。数字场作为中央内容周围的边缘层，鼠标靠近时轻微牵引、扭曲局部编织，保持阅读区域稳定。Canvas 不接管滚动、点击、键盘导航或认证状态。

基础静态场可在浏览器初始化后绘制，但必须预留稳定布局尺寸；关闭 JavaScript、Canvas 不可用或控制器失败时，正文、导航和 CTA 仍完整可用。装饰 Canvas 使用 `aria-hidden`，不成为焦点，也不生成屏幕阅读器需要逐个读取的字符节点。

实现通过 [HomePage](../apps/web/src/_pages/home/ui/home-page.tsx)组合，以下文件已落盘：

- [intelligence-weave.tsx](../apps/web/src/_pages/home/ui/intelligence-weave.tsx)：`IntelligenceWeave` 展示组件，保留布局、装饰语义与控制器挂载边界。
- [weave-scene.ts](../apps/web/src/_pages/home/model/weave-scene.ts)：可预计算的场景几何、绘制输入和纯绘制逻辑，不读取账户、Cookie 或 API。
- [use-intelligence-weave.ts](../apps/web/src/_pages/home/model/use-intelligence-weave.ts)：React 生命周期接线，卸载时调用控制器清理。
- [weave-controller.ts](../apps/web/src/_pages/home/model/weave-controller.ts)：设备与可见性条件、尺寸与主题响应、帧调度、空闲和 Canvas 上下文故障处理。
- [weave-controller.test.ts](../apps/web/src/_pages/home/model/weave-controller.test.ts)：验证绘制调度、设备与可见性条件、空闲暂停和释放资源。

场景预计算 10 条编织带、每条 56 个采样点，共 560 个点；数字字符和微点从同一组点分配，不构建逐点两两连接。控制器按 2,000,000 像素预算计算缓冲区缩放，并限制 DPR，避免随容器和屏幕分辨率无界扩大。这些数量是实现预算，不代表已测得的绘制耗时。控制器从共享 CSS 的 `--hero-canvas-primary`、`--hero-canvas-secondary`、`--hero-canvas-highlight`、`--hero-canvas-muted`、`--hero-canvas-glow`读取语义颜色；Canvas 绘图属性来自这些角色，不将颜色或动画样式散落到页面的内联 CSS 中。主题变化只触发必要的重绘，不启动账户同步。

## 动画控制器约束

以下是实施上限和可观察行为，**不是已测得的帧率、功耗或性能保证**。

- 绘图分辨率的有效 DPR 最大为 **1.5**，每次尺寸变化重新计算有界缓冲区；不改变页面 CSS 尺寸来匹配像素缓冲区。
- 动态绘制上限为 **30 帧/秒**，使用时间戳节流；不要求低性能设备达到该帧率，不用多个 RAF 或定时器补帧。
- 仅当组件在屏幕内、文档可见、设备具有细指针及 hover 能力、且用户未要求减少动态效果时启用鼠标动画。
- 停止输入后，在约 1,000ms 的衰减窗口后停止连续绘制；不以永久 RAF 循环维持一个静态画面。下一次有效输入、尺寸或主题变化再按条件恢复。
- 粗指针、减少动态效果、页面后台或离屏时不持续动画；必要的尺寸或主题更新可以绘制一个静态帧。
- 指针位置保存在控制器中，更新频率受调度上限限制，不通过每次 `pointermove` 的 React state 更新驱动整页渲染。
- 卸载时取消 RAF、空闲任务和计时器，移除事件与媒体查询监听，断开尺寸/可见性 Observer；重新挂载不能叠加旧循环。

实际诊断属性为 `data-weave-state=fallback|static|idle|active|paused`；`data-weave-drawn=true` 仅在成功绘制后设置。属性不放用户信息、鼠标历史或性能数据。Canvas 不可用、绘制失败或上下文丢失时显示静态 SVG 回退；恢复上下文后重新初始化，再按可见性和设备条件进入 idle/static/paused。测试不能将属性存在本身当作真正停止绘制的证明，应观察调度与绘制调用。

## 共享实现边界

现有 [Button](../packages/ui/src/components/button.tsx)、[Card](../packages/ui/src/components/card.tsx)、[Dropdown Menu](../packages/ui/src/components/dropdown-menu.tsx)、[Avatar](../packages/ui/src/components/avatar.tsx)与 [AppearanceProvider](../packages/ui/src/components/appearance-provider.tsx)保持组件和交互的基础地位。玻璃只是它们共享的材料和变体，不另建一套账户菜单、主题或按钮协议。

共享 [GlassSurface](../packages/ui/src/components/glass-surface.tsx) 经[公共出口](../packages/ui/src/index.ts)导出，提供 `subtle` 和 `raised` 两种强度。产品结构继续放在 `apps/*/src/_pages` 与对应 feature，主站、登录和购买不互相导入应用实现。

共享材料的 class 与角色为：`loom-glass` 承载普通内容、`loom-glass-strong` 承载高不透明度内容、`loom-glass-nav` 用于导航与 Portal 菜单、`loom-glass-control` 用于 outline/secondary 控件；`loom-atmosphere` 只提供不接收指针的静态环境装饰。主要按钮保持实色。对应 `--glass-*`、`--ambient-primary` / `--ambient-secondary` 均在共享主题中定义，不通过容器 opacity 或 filter 模糊正文。

样式继续集中在共享 `globals.css`，以现有 token 和职责明确的材料角色定义浅深主题、边缘、高光与降级。装饰运动只影响自身图层，不覆盖表单、焦点、加载反馈、测试付款说明或供应商品牌标识。托管 Logto 页的 Custom CSS 是独立配置，其作用边界沿用[品牌配置说明](logto-branding.md)，不据主站视觉自动宣称已经同步。

## 发布与验证结果

本轮已于2026-10-23发布以下版本，两者均由 Cloudflare 部署状态只读回查确认承接100%流量：

| 应用                  | Worker版本                             |
| --------------------- | -------------------------------------- |
| identity：登录与购买  | `87caa1d1-5ed3-4105-b97d-e3ebf02bfc09` |
| WWW：产品首页与工作区 | `bce8ba6d-25a1-4a70-842a-5ebb724489cd` |

- **代码与构建**：最终全仓 `mise run verify` 返回0，类型、lint、测试、构建及 dry-run 通过。相关测试共473项：identity-core263、identity149、Web51、i18n10；其中 Canvas控制器13项、主题SSR/VM6项。总数并非视觉专项数量，两应用未新增依赖。
- **本地 Workerd**：共享会话9/9组、最终HTTP67/67项通过。使用随机测试密钥、合成身份与独立临时D1，不是真实OIDC登录或令牌刷新；HTTP前后users、orders、entitlements、stripe_events、auth_sessions均为零，临时进程和数据已清理。
- **线上匿名 HTTP**：67/67项通过，覆盖默认英文、中文真实路径、旧英文地址保查询跳转、双语SSR/SEO、链接、私有缓存与非法请求拒绝。不使用真实浏览器会话，不发起登录、支付或有效Webhook。
- **实际主题首帧**：本地和线上分别12/12场景通过，检查WWW与统一登录页的默认、明确浅深、无效偏好及system两种系统外观。读取实际SSR HTML，在React接管页面前隔离执行输出脚本，核对class与color-scheme；不是仅测试源码字符串。线上使用curl的正常可信TLS路径取得HTML，再执行同一套Node VM断言。本地禁用JavaScript时，明确light/dark偏好的class与color-scheme也正确；system仍需同步脚本解析。
- **浏览器交互**：本地IAB确认鼠标active→idle、减少动态效果后的static与冷启动无控制台错误。正式WWW确认鼠标active且成功绘制、玻璃菜单与小头像、light选择后刷新保持，以及system随系统浅深条件刷新立即得到正确class和color-scheme；禁用JavaScript后，明确dark偏好仍输出正确class与color-scheme，装饰显示静态SVG回退。正式checkout深色账户页正常，未见控制台warning/error。
- **移动边界**：仅验证390px视口DOM布局和触摸媒体仿真，scrollWidth=390、h1宽342、Canvas缓冲宽585，触摸为static，DPR不超过1.5。失真移动截图不作为证据，不将这些结果称为真实移动设备的视觉验收。

本轮本地证据位于忽略目录 `.codex-artifacts/glass/`：`verify-final.log`、`shared-session-summary.json`、`http-final-local-summary.json`、`theme-prepaint-local.json`；线上证据为 `http-final-online-summary.json`、`theme-prepaint-online.json`、`online-deployment-readback.json`、`browser-verification.json`及对应检查明细。HTTP不执行Canvas，主题VM不代表完整浏览器交互，部署状态也不替代页面与功能验收。

可重复的本地命令如下，两条顺序执行，均自行使用3100/3101与临时D1，不占用常规3000/3001预览：

```bash
mise exec -- python scripts/check-shared-session.py
mise exec -- python .codex-artifacts/experience/run-local-default-en.py
```

第二条是本地忽略目录中的HTTP编排工具，其 `--online --local-transport` 使用正式Host名发往本机；实际线上检查不使用 `--local-transport`。验证必须使用待交付的冻结构建，避免把旧产物的成功当作当前实现证明。

**仍未验证**：Safari/Firefox的实际呈现、真实移动设备的连续性能、合成背景上的完整文字对比度测量，以及稳定帧率和功耗。不宣称全部浏览器或WCAG AA全面验收，也不把“最多30fps”写成“稳定30fps”。进一步性能检查需记录设备、视口、浏览器、绘制调度和主线程情况，确认离屏、后台与空闲时停止持续绘制。

视觉不改变账户显示的手动刷新策略；受保护请求仍逐次由服务端检查会话和D1权益。此前认证与支付证据作为对应能力的历史记录保留，本轮没有新增真实付款或退款。
