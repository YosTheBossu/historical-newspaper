#!/usr/bin/env bash
set -euo pipefail

# Preflight checks before running deploy/stage-2.
# Usage:
#   HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/u/r.git ./scripts/preflight_hostinger.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${REPO_URL:?Missing REPO_URL}"
HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Not inside git repository"
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ Missing origin remote"
  echo "   Run: git remote add origin $REPO_URL"
  exit 1
fi

echo "✅ Local git repository + origin are configured"

auth_user=""
for u in ${HOSTINGER_USERS}; do
  if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$u@$HOSTINGER_HOST" 'echo ok' >/dev/null 2>&1; then
    auth_user="$u"
    break
  fi
done

if [[ -z "$auth_user" ]]; then
  echo "❌ SSH check failed for users: $HOSTINGER_USERS"
  exit 1
fi

echo "✅ SSH connectivity OK with user: $auth_user"

ssh -o StrictHostKeyChecking=accept-new "$auth_user@$HOSTINGER_HOST" bash -s -- "$REMOTE_APP_DIR" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
PARENT_DIR="$(dirname "$APP_DIR")"

check_cmd() {
  local c="$1"
  if command -v "$c" >/dev/null 2>&1; then
    echo "✅ remote command exists: $c"
  else
    echo "❌ remote command missing: $c"
    return 1
  fi
}

check_cmd git
check_cmd node
check_cmd crontab
if command -v docker >/dev/null 2>&1; then
  echo "✅ remote optional command exists: docker"
else
  echo "⚠️ remote optional command missing: docker (required if you want container deployment)"
fi

if [[ -d "$APP_DIR" ]]; then
  echo "✅ remote app dir exists: $APP_DIR"
else
  echo "⚠️ remote app dir does not exist yet: $APP_DIR (will be created on first deploy)"
fi

if [[ -w "$PARENT_DIR" ]]; then
  echo "✅ write access to parent dir: $PARENT_DIR"
else
  echo "⚠️ no write access to parent dir: $PARENT_DIR"
fi
REMOTE

echo "✅ Preflight checks completed"
