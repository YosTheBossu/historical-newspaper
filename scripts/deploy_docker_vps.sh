#!/usr/bin/env bash
set -euo pipefail

# Deploy the Historical Newspaper to a VPS with Docker.
#
# Architecture:
#   - web:       nginx:alpine serving static files (port 8080)
#   - collector:  node:20-alpine running data-collector.js on-demand
#
# Usage:
#   HOSTINGER_HOST=1.2.3.4 ./scripts/deploy_docker_vps.sh
#
# Optional:
#   HOSTINGER_USER=root                    # SSH user (default: auto-detect)
#   REMOTE_APP_DIR=/docker/historical-newspaper  # Remote project directory
#   APP_PORT=8080                          # Port to expose
#   DEEPSEEK_API_KEY=sk-...               # DeepSeek API key for translations

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST — set the VPS IP address}"

HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/docker/historical-newspaper}"
APP_PORT="${APP_PORT:-8080}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Resolve SSH user ---
resolve_user() {
  if [[ -n "${HOSTINGER_USER:-}" ]]; then
    echo "$HOSTINGER_USER"
    return 0
  fi
  local u
  for u in ${HOSTINGER_USERS}; do
    if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$u@$HOSTINGER_HOST" 'echo ok' >/dev/null 2>&1; then
      echo "$u"
      return 0
    fi
  done
  return 1
}

echo "=== Deploy Historical Newspaper to VPS ==="
echo "Host: $HOSTINGER_HOST | Port: $APP_PORT"

echo "[1/5] Resolving SSH user..."
if ! SSH_USER="$(resolve_user)"; then
  echo "Could not connect. Set HOSTINGER_USER or ensure SSH key is configured." >&2
  exit 1
fi
echo "  -> SSH user: $SSH_USER"

SSH_TARGET="$SSH_USER@$HOSTINGER_HOST"

echo "[2/5] Syncing project files to VPS..."
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "mkdir -p $REMOTE_APP_DIR/nginx"

rsync -avz --delete \
  --exclude='.git' \
  --exclude='*.tar.gz' \
  --exclude='daily-digest-*.json' \
  --exclude='node_modules' \
  --exclude='.env' \
  "$ROOT_DIR/" "$SSH_TARGET:$REMOTE_APP_DIR/"

echo "[3/5] Building and starting container..."
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" bash -s -- "$REMOTE_APP_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"

# Detect docker compose command
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "docker compose not found on VPS" >&2
  exit 1
fi

# Build and start the all-in-one container (nginx + node + cron)
$COMPOSE build
$COMPOSE up -d --force-recreate

echo "  Container status:"
$COMPOSE ps
REMOTE

echo "[4/5] Verifying data collection..."
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" bash -s -- "$REMOTE_APP_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

echo "  Checking container logs for initial collection..."
sleep 5
$COMPOSE logs --tail=20 newspaper
echo "  Container is running — data collection happens on startup and via cron (02:00, 14:00 UTC)"
REMOTE

echo "[5/5] Health check..."
sleep 3
if curl -sf --connect-timeout 5 "http://$HOSTINGER_HOST:$APP_PORT/health" >/dev/null 2>&1; then
  echo "Site is live at: http://$HOSTINGER_HOST:$APP_PORT"
else
  echo "Site might still be starting. Check: http://$HOSTINGER_HOST:$APP_PORT"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Site URL:  http://$HOSTINGER_HOST:$APP_PORT"
echo ""
echo "The container includes built-in cron (02:00 and 14:00 UTC) for daily data collection."
echo ""
echo "Useful commands (run on VPS):"
echo "  cd $REMOTE_APP_DIR"
echo "  docker compose logs -f newspaper                     # View logs"
echo "  docker compose exec newspaper node data-collector.js # Run collector now"
echo "  docker compose down                                  # Stop everything"
echo "  docker compose up -d --build                         # Rebuild and start"
