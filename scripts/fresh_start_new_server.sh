#!/usr/bin/env bash
set -euo pipefail

# Fresh start flow for a brand new VPS.
# 1) ensure git origin
# 2) optional SSH password bootstrap -> key auth
# 3) run full automation: preflight + deploy + stage2 + health
#
# Usage:
#   HOSTINGER_HOST=187.77.75.48 REPO_URL=https://github.com/u/r.git HOSTINGER_USER=root SSH_PASSWORD='***' ./scripts/fresh_start_new_server.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${REPO_URL:?Missing REPO_URL}"
HOSTINGER_USER="${HOSTINGER_USER:-root}"
HOSTINGER_USERS="${HOSTINGER_USERS:-$HOSTINGER_USER yossi}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"
SETUP_DOCKER="${SETUP_DOCKER:-1}"
APP_PORT="${APP_PORT:-8080}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Run from inside git repository" >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

git branch -M "$BRANCH"

if [[ -n "${SSH_PASSWORD:-}" ]]; then
  echo "[A] Bootstrapping SSH key auth"
  HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USER="$HOSTINGER_USER" SSH_PASSWORD="$SSH_PASSWORD" ./scripts/bootstrap_ssh_key.sh
else
  echo "[A] SSH_PASSWORD not provided, assuming key-based auth is already configured"
fi

echo "[B] Running full automation flow"
HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" ./scripts/continue_automatically.sh

if [[ "$SETUP_DOCKER" == "1" ]]; then
  echo "[C] Provisioning Docker container for the site"
  HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" APP_PORT="$APP_PORT" ./scripts/run_docker_setup.sh
else
  echo "[C] Skipping Docker setup (SETUP_DOCKER=$SETUP_DOCKER)"
fi
