# hotkey-tools

参考 `evals-grader` 初始化的 Web 与 Python 工程。使用 mise 统一管理工具版本和开发命令，pnpm workspace + Turbo 编排应用与共享包，uv workspace 统一管理所有 Python package。

| 应用          | 技术栈                                                   | 职责                                                               |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web`    | Next.js 16、React 19、TypeScript、Tailwind CSS 4、Vitest | 静态 Web；`src/app` 负责框架适配，产品页面放在 `src/_pages`        |
| `apps/worker` | TypeScript、Hono、Wrangler                               | 托管静态资源、D1 示例 API、转发 Python 请求                        |
| `apps/python` | Python 3.13、FastAPI、Pydantic、uv、pytest、Ruff、mypy   | 快捷键规范化示例；可在 CPython 和 Cloudflare Python Workers 中运行 |

Web 沿用参考项目的 Next.js 技术栈，使用静态导出部署到 Workers Static Assets。目前不包含 Next.js 的 SSR、Server Actions 和 Node route handlers。Python 通过 Cloudflare 官方 ASGI 适配部署为独立 Worker，网关通过 service binding 调用；生产环境无需单独运行 Uvicorn。

## Workspace 组织

仓库根目录只承担 workspace 与工具配置职责。根 `pyproject.toml` 不含 `[project]` 或 `[build-system]`，因此不会生成或安装一个名为 `hotkey-tools` 的 Python package。根 `package.json` 是私有的任务编排配置，不承载应用代码。

```text
pyproject.toml                         # uv workspace、开发工具、Ruff/mypy/pytest 配置
uv.lock                                # 所有 Python 成员共用的依赖锁
.venv/                                 # 共用的本地开发环境，不提交
apps/python/
  pyproject.toml                       # FastAPI 应用 hotkey-tools-python
  pylock.toml                          # Cloudflare Pyodide 平台的部署依赖锁
  src/hotkey_tools/
  src/worker.py
packages/python/hotkey-core/
  pyproject.toml                       # 共享库 hotkey-tools-core
  src/hotkey_tools_core/
```

目前 uv workspace 包含 `apps/python` 和 `packages/python/*`。FastAPI 通过 `[project].dependencies` 声明 `hotkey-tools-core`，再用 `[tool.uv.sources]` 的 `workspace = true` 指向本仓库成员。快捷键规范化函数位于共享库，应用负责 HTTP 输入校验与响应。

所有成员共用根 `uv.lock` 和 `.venv`，开发工具依赖集中在根 `[dependency-groups].dev`；各成员自行声明运行时依赖、专用开发依赖与构建后端。相关规则见 [uv workspace 文档](https://docs.astral.sh/uv/concepts/projects/workspaces/)。

```bash
mise run python-sync     # uv sync --locked --all-packages，同步整个 workspace
mise run python-lock     # uv lock，统一更新所有成员的依赖锁
mise exec -- uv tree --locked --depth 1
mise exec -- uv run --locked --all-packages pytest
```

`uv run --package` 选择 workspace 成员的依赖环境，不改变当前目录。Wrangler 必须在 `apps/python` 目录读取应用配置，因此继续使用 `mise run dev-python`、`deploy-dry-run` 等入口；这些命令通过 pnpm 切到应用目录再执行。

新增共享 Python 包时，在 `packages/python/<目录>/` 下添加该包自己的 `pyproject.toml` 和源码；应用声明成员依赖及 `workspace = true`，再运行 `mise run python-lock` 和 `mise run python-sync`。成员中的私有 `package.json` 仅用于接入 Turbo 任务图；应用适配配置通过 workspace 依赖关联共享库，使库修改能触发对应检查和构建。

Cloudflare 的 `pylock.toml` 与 `.venv-workers` 服务于 Pyodide/WASM，保留在应用目录；它们不替代根 `uv.lock` 和开发环境。每次启动或部署前强制同步发布依赖，把共享库源码打包进 Worker，避免部署产物引用宿主机器的 editable 安装路径。修改共享库后重新执行启动命令即可更新本地 Worker。

## 初始化与开发

安装 mise 后，在项目根目录执行：

```bash
mise trust
mise run setup
mise run env-check
```

`setup` 安装项目工具链、按锁文件安装 pnpm 依赖和所有 uv workspace 成员、在缺失时从 `.env.example` 创建 `.env`，并应用本地 D1 migrations。重复执行不会覆盖 `.env` 或重置已有数据。首次运行 Python Worker 时，pywrangler 还会下载 Workers 专用 Python/WASM 运行时。

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

依次执行 TypeScript / mypy 类型检查、Oxlint / Ruff、格式检查、Vitest / pytest、两个 Python 包的 wheel/sdist 与 Web 构建，以及两个 Worker 的发布打包检查（dry-run）。可以单独运行 `mise run check-types`、`lint`、`test`、`format`、`build` 或 `deploy-dry-run`。

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
