FROM registry:2 AS registry-bin

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN mkdir -p public && npm run build

FROM node:22-alpine AS runner

LABEL org.opencontainers.image.title="Stash" \
      org.opencontainers.image.description="Self-hosted Docker, Maven & NPM registry admin panel" \
      org.opencontainers.image.url="https://github.com/adure/stash" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.authors="Adure"

# curl + tar: entrypoint installs Trivy binary + DBs into /data on first boot
RUN apk add --no-cache openssl supervisor ca-certificates su-exec curl tar && \
    addgroup -g 1001 -S stash && \
    adduser -u 1001 -S stash -G stash

COPY --from=registry-bin /bin/registry /usr/local/bin/registry

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/node-cron ./node_modules/node-cron

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/scripts/trivy-install.sh && \
    chown -R stash:stash /app

# /data is a volume — entrypoint will chown it on first boot
# supervisor and registry need to write to /var/log, /tmp, /data
# We run entrypoint as root so it can manage permissions, then drop to stash
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
