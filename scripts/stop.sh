#!/usr/bin/env bash
#
# Stop everything this project can start. Skips anything already stopped.
#
#   ./scripts/stop.sh
#
set -uo pipefail
cd "$(dirname "$0")/.."

kill_port() {
  local port="$1" what="$2" pids
  pids="$(lsof -ti "tcp:$port" 2>/dev/null)"
  if [ -n "$pids" ]; then
    echo "==> Stopping $what (port $port)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null
    sleep 1
    pids="$(lsof -ti "tcp:$port" 2>/dev/null)"
    # shellcheck disable=SC2086
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  else
    echo "    $what is not running (port $port)"
  fi
}

kill_port 3000 "Next.js dev server"
kill_port 3100 "Playwright's Next.js server"
kill_port 4983 "Drizzle Studio"

if docker compose ps --status running --quiet 2>/dev/null | grep -q .; then
  echo "==> Stopping and removing the Docker test database"
  docker compose down
else
  echo "    Docker test database is not running"
fi

echo "==> All stopped"
