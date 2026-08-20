#!/usr/bin/env bash
#
# Run the test suites against the Docker test database. Never touches Neon.
#
#   ./scripts/test.sh          both suites
#   ./scripts/test.sh --unit   Vitest only
#   ./scripts/test.sh --e2e    Playwright only
#
# Leaves the database container running so the next run is fast. Stop it with
# ./scripts/stop.sh or `npm run test:db:down`.
#
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_UNIT=1
RUN_E2E=1
case "${1:-}" in
  --unit) RUN_E2E=0 ;;
  --e2e) RUN_UNIT=0 ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop, then try again." >&2
  exit 1
fi

echo "==> Starting the test database on port 5433"
docker compose up -d --wait

if [ "$RUN_UNIT" = 1 ]; then
  echo "==> Vitest (service layer and route handlers)"
  npm test
fi

if [ "$RUN_E2E" = 1 ]; then
  if lsof -ti tcp:3100 >/dev/null 2>&1; then
    echo "Port 3100 is busy — Playwright needs it. Run ./scripts/stop.sh first." >&2
    exit 1
  fi
  echo "==> Playwright (real browser, its own server on port 3100)"
  npm run test:e2e
fi

echo "==> Tests finished"
