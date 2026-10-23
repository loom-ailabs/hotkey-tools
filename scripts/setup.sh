#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if [[ ! -f apps/identity/.env.local ]]; then
  cp apps/identity/.env.example apps/identity/.env.local
fi

if [[ ! -f apps/identity/.dev.vars ]]; then
  cp apps/identity/.env.example apps/identity/.dev.vars
fi

if [[ ! -f apps/web/.env.local ]]; then
  cp apps/web/.env.example apps/web/.env.local
fi

if [[ ! -f apps/web/.dev.vars ]]; then
  cp apps/web/.env.example apps/web/.dev.vars
fi

pnpm install --frozen-lockfile
uv sync --locked --all-packages --python "$(command -v python)"
pnpm cloudflare:db:migrate:local
pnpm identity:db:migrate:local
pnpm --filter @hotkey-tools/web db:migrate:local
