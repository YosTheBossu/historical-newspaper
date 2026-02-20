#!/bin/sh
set -e

echo "[entrypoint] Exporting environment for cron..."
# Write env vars with export so cron jobs can access API keys
printenv | grep -E '^(DEEPSEEK_|OPENROUTER_)' | sed 's/^/export /' > /etc/collector.env 2>/dev/null || true

# Show API key status in docker logs
if [ -n "$OPENROUTER_API_KEY" ]; then
    echo "[entrypoint] OPENROUTER_API_KEY: set (${OPENROUTER_API_KEY:0:12}...)"
    echo "[entrypoint] Primary LLM: OpenRouter"
else
    echo "[entrypoint] OPENROUTER_API_KEY: NOT SET"
fi

if [ -n "$DEEPSEEK_API_KEY" ]; then
    echo "[entrypoint] DEEPSEEK_API_KEY: set (${DEEPSEEK_API_KEY:0:8}...)"
else
    echo "[entrypoint] DEEPSEEK_API_KEY: NOT SET"
fi

if [ -z "$OPENROUTER_API_KEY" ] && [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "[entrypoint] WARNING: No LLM API keys set — translations and AI features will not work!"
fi

echo "[entrypoint] Starting cron daemon..."
crond -b -l 2

echo "[entrypoint] Running data collector in background (max 5 min)..."
cd /usr/share/nginx/html
# Collector runs in background with timeout; site serves fallback data immediately
(timeout 300 node data-collector.js 2>&1 | tee /var/log/collector.log || true) &

echo "[entrypoint] Starting nginx (site available immediately with fallback data)..."
exec nginx -g 'daemon off;'
