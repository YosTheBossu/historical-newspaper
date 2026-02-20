#!/bin/sh
set -e

echo "[entrypoint] Exporting environment for cron..."
# Write env vars so cron jobs can access DEEPSEEK_API_KEY
printenv | grep -E '^DEEPSEEK_' > /etc/collector.env 2>/dev/null || true

# Show API key status in docker logs
if [ -n "$DEEPSEEK_API_KEY" ]; then
    echo "[entrypoint] DEEPSEEK_API_KEY: set (${DEEPSEEK_API_KEY:0:8}...)"
else
    echo "[entrypoint] WARNING: DEEPSEEK_API_KEY is NOT SET - translations will not work!"
fi

echo "[entrypoint] Starting cron daemon..."
crond -b -l 2

echo "[entrypoint] Running initial data collection in background..."
echo "[entrypoint] Output will appear in docker logs below..."
cd /usr/share/nginx/html
# Pipe output to BOTH docker logs (stdout) AND log file
(node data-collector.js 2>&1 | tee /var/log/collector.log) &

echo "[entrypoint] Starting nginx..."
exec nginx -g 'daemon off;'
