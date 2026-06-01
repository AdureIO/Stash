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

RUN apk add --no-cache openssl supervisor ca-certificates

COPY --from=registry-bin /bin/registry /usr/local/bin/registry

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
