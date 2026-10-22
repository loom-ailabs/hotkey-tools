# Loom AI 产品演示的设计依据

本次把 `apps/web` 作为 `www.loom-labs.ai` 的产品首页与工作区；登录与购买分别使用 `login.loom-labs.ai`、`checkout.loom-labs.ai`。三者统一品牌与主题，身份和付款使用真实开发服务，工作计划使用固定示例。

## 愿景与内容

叙事来自 loom-box 的 `README.md`：**Connecting Intelligence. Crafting Tomorrow.**，以及桌面、浏览器、编辑器与 Web 之间连续的 AI 体验。首页使用“连接智能，织就你的下一步”表达这个方向。

“多端协作”“上下文延续”属于产品愿景。本站没有接入 loom-box daemon、真实模型或外部工具执行，不展示虚构用户量、效率、模型运行状态或客户背书。工作区明确标注“交互演示”“预置示例”，只有服务端权益校验通过后才展开固定工作计划。

## 视觉参考

外部参考为 [Linear 官方首页](https://linear.app/) 与 2026-03-12 发布的 [A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)。采用内容优先、降低导航视觉权重、柔和边框和低饱和底色的原则；首页以大字号、开放留白和多端连接轨道图传达科技感。界面、图形和文案为本项目实现，不复制 Linear 的品牌或产品内容。

表单与购买页主要参考 loom-box 的 `apps/loom-desktop/docs/design-language.md` 和实际 `webview/src/shared/styles/theme.css`：连续工作区、轻分隔、系统字体、36px 控件、8px 控件圆角及12px工作区圆角。当前桌面深色基底为 `#181818`，raised 为 `#232323`，边框 `#353535`，文字 `#dfdfdf`，链接 `#8bbfff`。本仓库将这些角色集中在 `packages/ui/src/styles/globals.css` 的 `.loom-dark` 中，业务组件使用语义颜色和 Tailwind spacing utilities。

## Logo 使用

- 彩色原稿直接复用 loom-box 的 `assets/brand/loom.png`，不重绘、不裁切角色；首页展示位采用较低透明度，与深色背景协调。
- 导航与表单使用该项目的正式单色派生标识 `apps/loom-desktop/plugins/tauri-plugin-loom-tray/icons/tray-18.svg`，通过 CSS 反色与透明度协调小尺寸展示；浏览器图标保留暖色原图。
- 两种标识保持同一环织形象，暖色不承担付款成功、服务在线等状态含义。

## 交互与真实边界

用户从产品携带 `returnTo` 进入统一登录页；会话有效则直接回到原产品，否则通过官方 Logto SDK 完成登录与回调后返回。返回地址限制在可信的 Loom 产品域名，合法路径与查询保持不变，拒绝外域、含片段的地址和登录循环目标。

页面采用 Next.js 路径路由：`/`、`/vision`、`/workspace`、`/pricing`。页面导航、登录和支付返回均不使用 Hash 地址；工作区可以直接打开和刷新。

正式登录会话 Cookie 设置为 `Domain=.loom-labs.ai; Path=/; Secure; HttpOnly; SameSite=Lax`，所有 Loom 子域共享同一会话格式与加密密钥；退出删除相同 Domain/Path 的 Cookie。所有子域都属于会话信任范围。主站和购买页使用同一 Logto 用户标识查询 D1 权益。购买后返回主站刷新状态，运行演示时再次由服务端检查权益；成功页参数不能开通，已退款订单不能再次提供权限。

当前只支持 Stripe Sandbox 的 USD 1.00 单次测试付款。界面明确显示测试环境，不宣称可收取正式款项。Google 同邮箱身份仍遵循用户“不关联”的选择，不以邮箱自动合并账号。
