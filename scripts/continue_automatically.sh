#!/usr/bin/env bash
set -euo pipefail

# End-to-end automation orchestrator:
# 1) deploy code
# 2) configure stage-2 automation
# 3) run stage-2 health check
#
# Usage:
#   HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/u/r.git ./scripts/continue_automatically.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${REPO_URL:?Missing REPO_URL}"
HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"

run_step() {
  local label="$1"
  shift
  echo
  echo "=============================="
  echo "$label"
  echo "=============================="
  "$@"
}

run_step "[Step 0/3] Preflight checks" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" \
  ./scripts/preflight_hostinger.sh

run_step "[Step 1/3] Deploy code to server" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" \
  ./scripts/deploy_hostinger.sh

run_step "[Step 2/3] Configure Stage-2 automation" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" \
  ./scripts/run_stage2_setup.sh

run_step "[Step 3/3] Run Stage-2 health check" \
  env HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USERS="$HOSTINGER_USERS" REMOTE_APP_DIR="$REMOTE_APP_DIR" \
  ./scripts/check_stage2_status.sh

echo
echo "✅ Full automatic flow completed (preflight + deploy + stage2 + health)"
