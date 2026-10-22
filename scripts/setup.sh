#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

pnpm install --frozen-lockfile
uv sync --locked --all-packages --python "$(command -v python)"
pnpm cloudflare:db:migrate:local
