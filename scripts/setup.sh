#!/usr/bin/env bash
#
# One-time setup for a fresh clone. Safe to run again — every step is idempotent.
#
#   ./scripts/setup.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Installing npm dependencies"
npm install

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  cat <<'MSG'

.env.local did not exist, so it was created from .env.example.

Fill in these values before continuing, then run this script again:
  DATABASE_URL           pooled Neon string  (host contains "-pooler")
  DATABASE_URL_UNPOOLED  direct Neon string  (same host, no "-pooler")
  AUTH_SECRET            generate one with:  npx auth secret

MSG
  exit 1
fi

step "Generating Next.js route types"
npx next typegen

step "Installing the Playwright browser (Chromium)"
npx playwright install chromium

step "Applying database migrations to Neon"
npm run db:migrate

step "Seeding the global exercise catalog"
npm run db:seed

step "Done"
echo "Start the app with: ./scripts/start.sh"
