#!/bin/sh
set -e

echo "[entrypoint] Starting cron daemon..."
crond -b -l 2

echo "[entrypoint] Running initial data collection..."
cd /usr/share/nginx/html
node data-collector.js >> /var/log/collector.log 2>&1 || echo "[entrypoint] Initial collection failed (non-fatal)"

echo "[entrypoint] Starting nginx..."
exec nginx -g 'daemon off;'
