#!/usr/bin/env bash
set -euo pipefail

# Configure and run a fresh Docker container stack on remote VPS.
# Usage:
#   HOSTINGER_HOST=187.77.75.48 ./scripts/run_docker_setup.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
DOCKER_STACK_DIR="${DOCKER_STACK_DIR:-/opt/historical-newspaper-docker}"
APP_PORT="${APP_PORT:-8080}"
CONTAINER_NAME="${CONTAINER_NAME:-historical-newspaper-web}"

resolve_user() {
  local u
  for u in ${HOSTINGER_USERS}; do
    if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$u@$HOSTINGER_HOST" 'echo ok' >/dev/null 2>&1; then
      echo "$u"
      return 0
    fi
  done
  return 1
}

if ! user="$(resolve_user)"; then
  echo "❌ Could not connect with users: $HOSTINGER_USERS" >&2
  exit 1
fi

echo "✅ Using SSH user: $user"

ssh -o StrictHostKeyChecking=accept-new "$user@$HOSTINGER_HOST" bash -s -- "$REMOTE_APP_DIR" "$DOCKER_STACK_DIR" "$APP_PORT" "$CONTAINER_NAME" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
STACK_DIR="$2"
APP_PORT="$3"
CONTAINER_NAME="$4"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  echo "ℹ️ Docker not found. Installing Docker automatically..."
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y ca-certificates curl gnupg
    $SUDO install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      ${VERSION_CODENAME} stable" | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
    $SUDO apt-get update -y
    $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    $SUDO systemctl enable --now docker
  else
    echo "❌ Unsupported OS package manager. Install Docker manually and rerun." >&2
    exit 1
  fi
}

install_docker_if_missing

if $SUDO docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="$SUDO docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="$SUDO docker-compose"
else
  echo "❌ docker compose plugin is missing" >&2
  exit 1
fi

$SUDO mkdir -p "$APP_DIR" "$STACK_DIR"

if [ ! -f "$APP_DIR/index.html" ]; then
  cat > /tmp/index.html <<HTML
<!doctype html>
<html lang="he" dir="rtl">
  <head><meta charset="utf-8"><title>העיתון של ההיסטוריה</title></head>
  <body style="font-family:Arial,sans-serif;padding:2rem;">
    <h1>העיתון של ההיסטוריה</h1>
    <p>הקונטיינר החדש עלה בהצלחה ✅</p>
  </body>
</html>
HTML
  $SUDO mv /tmp/index.html "$APP_DIR/index.html"
fi

cat > /tmp/docker-compose.yml <<YAML
services:
  web:
    image: nginx:alpine
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    ports:
      - "${APP_PORT}:80"
    volumes:
      - ${APP_DIR}:/usr/share/nginx/html:ro
YAML

$SUDO mv /tmp/docker-compose.yml "$STACK_DIR/docker-compose.yml"

cd "$STACK_DIR"
$COMPOSE_CMD up -d

echo "✅ Docker container is up"
$COMPOSE_CMD ps
REMOTE

echo "🌍 Done. Open: http://$HOSTINGER_HOST:$APP_PORT"
