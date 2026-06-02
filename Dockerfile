FROM registry:2 AS registry-bin

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

LABEL org.opencontainers.image.title="Depot" \
      org.opencontainers.image.description="Self-hosted Docker, Maven & NPM registry admin panel" \
      org.opencontainers.image.url="https://github.com/adure/depot" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.authors="Adure"

RUN apk add --no-cache openssl supervisor ca-certificates su-exec && \
    addgroup -g 1001 -S depot && \
    adduser -u 1001 -S depot -G depot

COPY --from=registry-bin /bin/registry /usr/local/bin/registry

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && \
    chown -R depot:depot /app

# /data is a volume — entrypoint will chown it on first boot
# supervisor and registry need to write to /var/log, /tmp, /data
# We run entrypoint as root so it can manage permissions, then drop to depot
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
