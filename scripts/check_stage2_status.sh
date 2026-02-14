#!/usr/bin/env bash
set -euo pipefail

# One-command Stage-2 health check over SSH.
# Usage:
#   HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/u/r.git ./scripts/check_stage2_status.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
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
  echo "❌ SSH failed for users: $HOSTINGER_USERS"
  exit 1
fi

echo "✅ SSH user: $user"

ssh -o StrictHostKeyChecking=accept-new "$user@$HOSTINGER_HOST" bash -s -- "$REMOTE_APP_DIR" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
LOG_DIR="/var/log/historical-newspaper"

echo "== APP_DIR =="
echo "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  echo "✅ git repo exists"
  cd "$APP_DIR"
  echo "branch: $(git branch --show-current || true)"
  echo "last commit: $(git log --oneline -n 1 || true)"
else
  echo "❌ app repo missing at $APP_DIR"
fi

echo

echo "== Scripts =="
for f in "$APP_DIR/scripts/auto_pull.sh" "$APP_DIR/scripts/run_daily_collector.sh"; do
  if [[ -x "$f" ]]; then
    echo "✅ $(basename "$f") exists + executable"
  else
    echo "❌ missing or not executable: $f"
  fi
done

echo

echo "== Crontab =="
if crontab -l >/tmp/_cron_stage2 2>/dev/null; then
  grep -E 'historical-newspaper/scripts/(auto_pull|run_daily_collector)\.sh' /tmp/_cron_stage2 || true
  if grep -q 'historical-newspaper/scripts/auto_pull.sh' /tmp/_cron_stage2; then
    echo "✅ auto_pull cron found"
  else
    echo "❌ auto_pull cron missing"
  fi
  if grep -q 'historical-newspaper/scripts/run_daily_collector.sh' /tmp/_cron_stage2; then
    echo "✅ collector cron found"
  else
    echo "❌ collector cron missing"
  fi
else
  echo "❌ no crontab for current user"
fi
rm -f /tmp/_cron_stage2 || true

echo

echo "== Logs =="
if [[ -d "$LOG_DIR" ]]; then
  echo "✅ log dir exists: $LOG_DIR"
  for l in auto-pull.log collector.log; do
    if [[ -f "$LOG_DIR/$l" ]]; then
      echo "--- tail $l ---"
      tail -n 20 "$LOG_DIR/$l" || true
    else
      echo "⚠️ log not yet created: $LOG_DIR/$l"
    fi
  done
else
  echo "⚠️ log dir missing: $LOG_DIR"
fi
REMOTE
