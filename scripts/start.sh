#!/usr/bin/env bash
#
# Start the app for local development.
#
#   ./scripts/start.sh                 app only, on http://localhost:3000
#   ./scripts/start.sh --with-studio   also open Drizzle Studio
#   ./scripts/start.sh --with-test-db  also start the Docker test database
#
# The app talks to Neon in the cloud. Neon needs nothing started; it wakes on
# the first query.
#
set -euo pipefail
cd "$(dirname "$0")/.."

WITH_STUDIO=0
WITH_TEST_DB=0
for arg in "$@"; do
  case "$arg" in
    --with-studio) WITH_STUDIO=1 ;;
    --with-test-db) WITH_TEST_DB=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -d node_modules ]; then
  echo "node_modules is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  echo ".env.local is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

if lsof -ti tcp:3000 >/dev/null 2>&1; then
  echo "Something is already listening on port 3000. Run ./scripts/stop.sh first." >&2
  exit 1
fi

if [ "$WITH_TEST_DB" = 1 ]; then
  echo "==> Starting the Docker test database on port 5433"
  docker compose up -d --wait
fi

if [ "$WITH_STUDIO" = 1 ]; then
  echo "==> Starting Drizzle Studio (https://local.drizzle.studio, port 4983)"
  npm run db:studio >/tmp/drizzle-studio.log 2>&1 &
  echo "    logs: /tmp/drizzle-studio.log"
fi

echo "==> Starting the Next.js dev server on http://localhost:3000"
echo "    Press Ctrl+C to stop it. Then run ./scripts/stop.sh to stop the rest."
exec npm run dev
