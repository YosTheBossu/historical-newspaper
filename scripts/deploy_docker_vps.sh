#!/usr/bin/env bash
set -euo pipefail

# Deploy the project to a VPS with Docker.
# Syncs the project files, builds the Docker image on the VPS, and starts the container.
#
# Usage:
#   HOSTINGER_HOST=1.2.3.4 ./scripts/deploy_docker_vps.sh
#
# Optional:
#   HOSTINGER_USER=root          # SSH user (default: auto-detect root/yossi)
#   REMOTE_APP_DIR=/opt/newspaper # Remote project directory
#   APP_PORT=8080                 # Port to expose
#   CONTAINER_NAME=historical-newspaper

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST — set the VPS IP address}"

HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/historical-newspaper}"
APP_PORT="${APP_PORT:-8080}"
CONTAINER_NAME="${CONTAINER_NAME:-historical-newspaper}"

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

echo "=== Deploy to VPS with Docker ==="
echo "Host: $HOSTINGER_HOST | Port: $APP_PORT"

echo "[1/4] Resolving SSH user..."
if ! SSH_USER="$(resolve_user)"; then
  echo "❌ Could not connect. Set HOSTINGER_USER or ensure SSH key is configured." >&2
  exit 1
fi
echo "  -> SSH user: $SSH_USER"

SSH_TARGET="$SSH_USER@$HOSTINGER_HOST"

echo "[2/4] Syncing project files to VPS..."
# Create remote directory
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "mkdir -p $REMOTE_APP_DIR"

# Sync files (exclude .git, archives, and daily digests)
rsync -avz --delete \
  --exclude='.git' \
  --exclude='*.tar.gz' \
  --exclude='daily-digest-*.json' \
  --exclude='node_modules' \
  "$ROOT_DIR/" "$SSH_TARGET:$REMOTE_APP_DIR/"

echo "[3/4] Building and starting Docker container on VPS..."
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" bash -s -- "$REMOTE_APP_DIR" "$APP_PORT" "$CONTAINER_NAME" <<'REMOTE'
set -euo pipefail

APP_DIR="$1"
APP_PORT="$2"
CONTAINER_NAME="$3"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

cd "$APP_DIR"

# Detect docker compose command
if $SUDO docker compose version >/dev/null 2>&1; then
  COMPOSE="$SUDO docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="$SUDO docker-compose"
else
  echo "❌ docker compose not found on VPS" >&2
  exit 1
fi

# Export port for docker-compose.yml
export APP_PORT="$APP_PORT"

# Build and restart
echo "  Building image..."
$COMPOSE build --no-cache

echo "  Starting container..."
$COMPOSE up -d --force-recreate

echo "  Container status:"
$COMPOSE ps
REMOTE

echo "[4/4] Health check..."
sleep 3
if curl -sf --connect-timeout 5 "http://$HOSTINGER_HOST:$APP_PORT/health" >/dev/null 2>&1; then
  echo "✅ Site is live at: http://$HOSTINGER_HOST:$APP_PORT"
else
  echo "⚠️  Site might still be starting. Check: http://$HOSTINGER_HOST:$APP_PORT"
fi

echo ""
echo "=== Done ==="
echo "Site URL: http://$HOSTINGER_HOST:$APP_PORT"
echo ""
echo "Useful commands (run on VPS):"
echo "  cd $REMOTE_APP_DIR && docker compose logs -f   # View logs"
echo "  cd $REMOTE_APP_DIR && docker compose restart    # Restart"
echo "  cd $REMOTE_APP_DIR && docker compose down       # Stop"
