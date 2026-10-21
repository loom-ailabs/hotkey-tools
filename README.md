# hotkey-tools

参考 `evals-grader` 初始化的 Web 与 Python 工程。使用 mise 统一管理工具版本和开发命令，pnpm workspace + Turbo 编排三个应用。

| 应用          | 技术栈                                                   | 职责                                                               |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web`    | Next.js 16、React 19、TypeScript、Tailwind CSS 4、Vitest | 静态 Web；`src/app` 负责框架适配，产品页面放在 `src/_pages`        |
| `apps/worker` | TypeScript、Hono、Wrangler                               | 托管静态资源、D1 示例 API、转发 Python 请求                        |
| `apps/python` | Python 3.13、FastAPI、Pydantic、uv、pytest、Ruff、mypy   | 快捷键规范化示例；可在 CPython 和 Cloudflare Python Workers 中运行 |

Web 沿用参考项目的 Next.js 技术栈，使用静态导出部署到 Workers Static Assets。目前不包含 Next.js 的 SSR、Server Actions 和 Node route handlers。Python 通过 Cloudflare 官方 ASGI 适配部署为独立 Worker，网关通过 service binding 调用；生产环境无需单独运行 Uvicorn。

## 初始化与开发

安装 mise 后，在项目根目录执行：

```bash
mise trust
mise run setup
mise run env-check
```

`setup` 安装项目工具链、按锁文件安装 pnpm 与 Python 依赖、在缺失时从 `.env.example` 创建 `.env`，并应用本地 D1 migrations。重复执行不会覆盖 `.env` 或重置已有数据。首次运行 Python Worker 时，pywrangler 还会下载 Workers 专用 Python/WASM 运行时。

```bash
mise run dev               # 同时启动三个应用
mise run dev-web           # Next.js 热更新，http://localhost:3000
mise run dev-worker        # 构建 Web、迁移本地 D1，再启动网关 http://localhost:8787
mise run dev-python        # Python Worker，http://localhost:8788
mise run dev-python-local  # 可选：CPython + Uvicorn，http://localhost:8000
```

访问 `http://localhost:8787` 可以预览部署结构中的静态 Web；网关会调用同时运行的 Python Worker。`dev-web` 提供前端热更新，网关中的静态资源在重新构建 Web 后更新。

mise 固定 Node.js 24、pnpm 12.10.1、Python 3.13、uv 0.12.3。工具版本与任务放在 `.mise.toml`，运行时配置放在 `.env.example` 和本地 `.env`。不要使用 `mise use -g` 修改其他项目的全局默认版本。临时命令通过 `mise exec -- <command>` 执行。

## 验证

```bash
mise run verify
```

依次执行 TypeScript / mypy 类型检查、Oxlint / Ruff、格式检查、Vitest / pytest、构建，以及两个 Worker 的发布打包检查（dry-run）。可以单独运行 `mise run check-types`、`lint`、`test`、`format`、`build` 或 `deploy-dry-run`。

`deploy-dry-run` 不发布站点、不创建远端数据库，也不能证明云端配额、账号权限或远端数据库迁移已正确配置。

启动 `mise run dev` 后，可在另一个终端运行 `mise run smoke`，验证两个 Web 入口、D1 健康与数据读写删除、Python Worker 及网关调用。该检查只访问本机，并在结束时删除它创建的测试记录。

## Cloudflare 部署与存储

目标使用 Workers Free + Workers Static Assets + D1。代码不要求付费产品；免费配额取决于 Cloudflare 账号中的实际套餐，并非不限量使用。按 2026-10-21 查阅的官方文档，Workers Free 包含每日 100,000 次动态请求和每次请求 10 ms CPU 时间；D1 包含每日 500 万行读取、10 万行写入和总计 5 GB 存储。超出免费配额会限制请求或查询，不会由本项目自动升级套餐。

官方依据：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[Python Workers FastAPI](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)。

首次云端部署需要：

```bash
mise run cloudflare-login
mise run cloudflare-status
mise run cloudflare-db-create
```

将创建命令输出的 `database_id` 填入 `apps/worker/wrangler.jsonc`，替换全零 UUID。全零 UUID 仅供本地模拟使用；远端迁移和部署入口会拒绝该占位值。

```bash
mise run cloudflare-db-migrate
mise run deploy
```

部署顺序为 Python Worker → Web 构建与网关 Worker。Python 的 `workers_dev=false`，只通过网关 service binding 提供服务。Web 静态资源、示例 API 和 D1 位于同一个网关 Worker 下，不需要付费容器或独立服务器。

D1 初始表结构在 `apps/worker/migrations/0001_init.sql`。增加或修改字段时新增 migration；不要直接修改已应用的 migration。重新执行本地 migration 使用 `mise run cloudflare-db-migrate-local`。

## 示例接口

| 网关接口                  | 功能                                          |
| ------------------------- | --------------------------------------------- |
| `GET /api/health`         | 检查 D1 绑定与初始表是否可查询；异常返回 503  |
| `GET /api/hotkeys`        | 读取 D1 示例列表                              |
| `POST /api/hotkeys`       | 创建示例记录，必填 `name`、`combination`      |
| `DELETE /api/hotkeys/:id` | 删除示例记录                                  |
| `POST /api/normalize`     | 通过 service binding 调用 Python `/normalize` |

Python 自身提供 `GET /health` 和 `POST /normalize`。这些接口用于验证技术链路；D1 示例读写目前没有用户隔离和身份校验，业务权限需要在正式产品功能中实现。
