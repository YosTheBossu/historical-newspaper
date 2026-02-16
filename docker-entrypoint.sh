#!/bin/sh
set -e

echo "[entrypoint] Exporting environment for cron..."
# Write env vars so cron jobs can access DEEPSEEK_API_KEY
printenv | grep -E '^DEEPSEEK_' > /etc/collector.env 2>/dev/null || true

echo "[entrypoint] Starting cron daemon..."
crond -b -l 2

echo "[entrypoint] Running initial data collection in background..."
cd /usr/share/nginx/html
node data-collector.js >> /var/log/collector.log 2>&1 &

echo "[entrypoint] Starting nginx..."
exec nginx -g 'daemon off;'
