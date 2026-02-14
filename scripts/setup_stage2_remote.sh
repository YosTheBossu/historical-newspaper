#!/usr/bin/env bash
set -euo pipefail

# Stage 2 on VPS: configure automatic updates + daily collector
# Run this script ON THE SERVER (or via SSH command runner).

APP_DIR="${APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"
SCHEDULE_PULL="${SCHEDULE_PULL:-*/10 * * * *}"
SCHEDULE_COLLECTOR="${SCHEDULE_COLLECTOR:-0 2 * * *}"
LOG_DIR="${LOG_DIR:-/var/log/historical-newspaper}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "App dir is not a git repo: $APP_DIR" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

AUTO_PULL_SH="$APP_DIR/scripts/auto_pull.sh"
cat > "$AUTO_PULL_SH" <<AUTOPULL
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
AUTOPULL
chmod +x "$AUTO_PULL_SH"

RUN_COLLECTOR_SH="$APP_DIR/scripts/run_daily_collector.sh"
cat > "$RUN_COLLECTOR_SH" <<COLLECTOR
#!/usr/bin/env bash
set -euo pipefail
cd "$APP_DIR"
/usr/bin/env node data-collector.js >> "$LOG_DIR/collector.log" 2>&1 || true
COLLECTOR
chmod +x "$RUN_COLLECTOR_SH"

CRON_FILE="/tmp/historical-newspaper.cron"
crontab -l 2>/dev/null | grep -v 'historical-newspaper/scripts/auto_pull.sh' | grep -v 'historical-newspaper/scripts/run_daily_collector.sh' > "$CRON_FILE" || true

echo "$SCHEDULE_PULL $AUTO_PULL_SH >> $LOG_DIR/auto-pull.log 2>&1" >> "$CRON_FILE"
echo "$SCHEDULE_COLLECTOR $RUN_COLLECTOR_SH" >> "$CRON_FILE"

crontab "$CRON_FILE"
rm -f "$CRON_FILE"

echo "Stage 2 configured"
echo "- auto pull: $SCHEDULE_PULL"
echo "- collector: $SCHEDULE_COLLECTOR"
echo "- logs: $LOG_DIR"
