#!/usr/bin/env bash
set -euo pipefail

# One-command setup for non-technical usage.
# Defaults are tailored for this project and can be overridden via env vars.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOSTINGER_HOST="${HOSTINGER_HOST:-187.77.75.48}"
HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"
HOSTINGER_USER="${HOSTINGER_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-8080}"
SETUP_DOCKER="${SETUP_DOCKER:-1}"

REPO_URL="${REPO_URL:-}"
if [[ -z "$REPO_URL" ]]; then
  REPO_URL="$(git remote get-url origin 2>/dev/null || true)"
fi

if [[ -z "$REPO_URL" ]]; then
  echo "❌ חסר REPO_URL וגם אין origin בריפו המקומי."
  echo "הרץ שוב ככה: REPO_URL=https://github.com/<user>/<repo>.git ./scripts/run_everything_now.sh"
  exit 1
fi

echo "🚀 מתחיל הכל לבד..."
echo "שרת: $HOSTINGER_HOST | משתמשים: $HOSTINGER_USERS | ריפו: $REPO_URL"

if [[ -n "${SSH_PASSWORD:-}" ]]; then
  echo "🔐 מגדיר מפתח SSH חד-פעמי..."
  HOSTINGER_HOST="$HOSTINGER_HOST" HOSTINGER_USER="$HOSTINGER_USER" SSH_PASSWORD="$SSH_PASSWORD" \
    "$ROOT_DIR/scripts/bootstrap_ssh_key.sh"
else
  echo "ℹ️ לא הוגדרה SSH_PASSWORD, מדלג על bootstrap ומניח שמפתח SSH כבר עובד"
fi

HOSTINGER_HOST="$HOSTINGER_HOST" REPO_URL="$REPO_URL" HOSTINGER_USERS="$HOSTINGER_USERS" \
REMOTE_APP_DIR="$REMOTE_APP_DIR" BRANCH="$BRANCH" APP_PORT="$APP_PORT" SETUP_DOCKER="$SETUP_DOCKER" \
  "$ROOT_DIR/scripts/step_by_step_setup.sh"

echo "✅ הסתיים. נסה לפתוח: http://$HOSTINGER_HOST:$APP_PORT"
