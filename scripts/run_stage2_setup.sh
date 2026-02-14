#!/usr/bin/env bash
set -euo pipefail

# Run stage-2 remote setup over SSH.
# Usage:
#   HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/u/r.git ./scripts/run_stage2_setup.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${REPO_URL:?Missing REPO_URL}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"
HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"

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
  echo "Could not connect with users: $HOSTINGER_USERS" >&2
  exit 1
fi

echo "Using SSH user: $user"

ssh -o StrictHostKeyChecking=accept-new "$user@$HOSTINGER_HOST" bash -s -- "$REMOTE_APP_DIR" "$REPO_URL" "$BRANCH" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
REPO_URL="$2"
BRANCH="$3"

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH" || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"

APP_DIR="$APP_DIR" BRANCH="$BRANCH" "$APP_DIR/scripts/setup_stage2_remote.sh"
REMOTE
