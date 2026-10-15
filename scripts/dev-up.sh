#!/usr/bin/env bash
# scripts/dev-up.sh — start the ENTIRE myplatform dev stack with one command.
#
#   ./scripts/dev-up.sh              # postgres+redis, ngrok, api, web, all 5 workers
#   ./scripts/dev-up.sh --no-tunnel  # same, but skip ngrok
#   NGROK_DOMAIN=your.ngrok.dev ./scripts/dev-up.sh   # custom tunnel domain
#
# Ctrl+C stops everything except the docker containers (they stay up so restarts
# are fast). Stop them with: docker compose down

set -euo pipefail
cd "$(dirname "$0")/.."

TUNNEL_DOMAIN="${NGROK_DOMAIN:-femur-mandatory-unsheathe.ngrok-free.dev}"
RUN_TUNNEL=1
for arg in "$@"; do
  case "$arg" in
    --no-tunnel) RUN_TUNNEL=0 ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ── 1. Docker: postgres + redis ────────────────────────────────────────────
step "Starting postgres + redis (docker compose)"
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop first."
  exit 1
fi
docker compose up -d postgres redis

step "Waiting for postgres + redis to be healthy"
for i in $(seq 1 30); do
  ok=$(docker compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null | awk '$2!="healthy"{print 0}' | wc -l | tr -d ' ')
  [ "$ok" = "0" ] && break
  [ "$i" = "30" ] && { echo "ERROR: containers did not become healthy"; docker compose ps; exit 1; }
  sleep 1
done
echo "postgres + redis healthy."

# ── 2. ngrok tunnel (webhooks) ─────────────────────────────────────────────
if [ "$RUN_TUNNEL" = "1" ]; then
  step "Starting ngrok tunnel: ${TUNNEL_DOMAIN} -> :4000"
  if command -v ngrok >/dev/null 2>&1; then
    nohup ngrok http --url="${TUNNEL_DOMAIN}" --log=stdout --log-format=json 4000 \
      > /tmp/myplatform-ngrok.log 2>&1 &
    NGROK_PID=$!
    disown "$NGROK_PID" 2>/dev/null || true
    sleep 2
    echo "Tunnel PID ${NGROK_PID} (log: /tmp/myplatform-ngrok.log)"
    echo "GitHub webhook URL: https://${TUNNEL_DOMAIN}/webhooks/github"
  else
    echo "WARNING: ngrok not installed — skipping tunnel (webhooks will not arrive)."
  fi
else
  echo "Skipping ngrok tunnel (--no-tunnel)."
fi

# ── 3. App processes: api + web + 5 workers via turbo ─────────────────────
# turbo runs every workspace's `dev` script, prefixes and interleaves the
# logs, and forwards Ctrl+C to all of them.
step "Starting api + web + workers (turbo dev)"
echo "  web      → http://localhost:3000"
echo "  api      → http://localhost:4000"
echo "  workers  → build, cleanup, deploy, monitoring, notifications"
echo ""
echo "Ctrl+C stops all app processes (postgres/redis stay up)."
echo ""

exec pnpm exec turbo dev
