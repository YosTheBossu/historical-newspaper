#!/usr/bin/env bash
set -euo pipefail

# Guided step-by-step setup for a brand-new VPS.
# Executes each stage in order and stops on first failure.
#
# Usage:
#   HOSTINGER_HOST=187.77.75.48 \
#   REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
#   HOSTINGER_USERS="root yossi" \
#   HOSTINGER_USER=root \
#   SSH_PASSWORD='***' \
#   APP_PORT=8080 \
#   ./scripts/step_by_step_setup.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${REPO_URL:?Missing REPO_URL}"

HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
HOSTINGER_USER="${HOSTINGER_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-8080}"
SETUP_DOCKER="${SETUP_DOCKER:-1}"

step() {
  echo
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔹 $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

run_step() {
  local title="$1"
  shift
  step "$title"
  "$@"
  echo "✅ $title"
}

run_step "Step 1/7: Local prerequisites" bash -c '
  command -v git >/dev/null 2>&1 || { echo "❌ git missing"; exit 1; }
  command -v ssh >/dev/null 2>&1 || { echo "❌ ssh missing"; exit 1; }
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ run from inside repo"; exit 1; }
'

if [[ -n "${SSH_PASSWORD:-}" ]]; then
  run_step "Step 2/7: Bootstrap SSH key auth" \
    env HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USER="$HOSTINGER_USER" SSH_PASSWORD="$SSH_PASSWORD" ./scripts/bootstrap_ssh_key.sh
else
  step "Step 2/7: Bootstrap SSH key auth"
  echo "ℹ️ SSH_PASSWORD not provided, skipping bootstrap (assuming key auth already works)"
fi

run_step "Step 3/7: Preflight checks" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" ./scripts/preflight_hostinger.sh

run_step "Step 4/7: Deploy project" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" ./scripts/deploy_hostinger.sh

run_step "Step 5/7: Setup Stage 2 automation" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" ./scripts/run_stage2_setup.sh

if [[ "$SETUP_DOCKER" == "1" ]]; then
  run_step "Step 6/7: Create Docker container" \
    env HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" APP_PORT="$APP_PORT" ./scripts/run_docker_setup.sh
else
  step "Step 6/7: Create Docker container"
  echo "ℹ️ skipped (SETUP_DOCKER=$SETUP_DOCKER)"
fi

run_step "Step 7/7: Health check" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" ./scripts/check_stage2_status.sh

echo
step "Done"
echo "🌍 If Docker is enabled, open: http://$HOSTINGER_HOST:$APP_PORT"
