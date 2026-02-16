# Stage 1: Collect initial data with Node.js (Wikipedia only, no API key needed)
FROM node:20-alpine AS collector
WORKDIR /app
COPY data-collector.js date-system.js ./
# Create empty fallback files so COPY in stage 2 never fails
RUN touch today.json example-events.json \
    && node data-collector.js || true

# Stage 2: Production image with nginx + cron + node for daily updates
FROM nginx:alpine

# Install Node.js and cron utilities for the daily data collector
RUN apk add --no-cache nodejs dcron

# Copy nginx configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy site files
WORKDIR /usr/share/nginx/html
COPY index.html style.css date-system.js data-collector.js ./

# Copy generated data from collector stage (fallback: empty files always exist)
COPY --from=collector /app/today.json ./today.json
COPY --from=collector /app/example-events.json ./example-events.json

# Setup cron job for daily data collection at 02:00 and 14:00
# Sources /etc/collector.env to get DEEPSEEK_API_KEY (written by entrypoint)
RUN echo '0 2,14 * * * . /etc/collector.env; cd /usr/share/nginx/html && node data-collector.js >> /var/log/collector.log 2>&1' \
    > /etc/crontabs/root

# Create empty env file (entrypoint will populate it)
RUN touch /etc/collector.env

# Entrypoint script: start cron + nginx
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
