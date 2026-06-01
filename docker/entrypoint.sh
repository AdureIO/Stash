#!/bin/sh
set -e

DATA=/data
mkdir -p "$DATA/registry" "$DATA/maven"

# --- Auth keypair ---
if [ ! -f "$DATA/auth.key" ]; then
  echo "[registry-admin] First boot — generating auth keypair..."
  openssl genrsa -out "$DATA/auth.key" 4096 2>/dev/null
  openssl req -new -x509 -key "$DATA/auth.key" \
    -out "$DATA/auth.crt" -days 3650 \
    -subj "/CN=registry-auth" 2>/dev/null
  echo "[registry-admin] Auth keypair generated."
fi

# --- Persist secrets to volume so restarts don't kill sessions ---
SECRETS_FILE="$DATA/.secrets"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "TOKEN_SECRET=$(openssl rand -hex 32)" >> "$SECRETS_FILE"
  echo "WEBHOOK_SECRET=$(openssl rand -hex 16)" >> "$SECRETS_FILE"
  echo "REGISTRY_SECRET=$(openssl rand -hex 16)" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
fi

# Load persisted secrets (env vars take precedence if explicitly set)
. "$SECRETS_FILE"
TOKEN_SECRET="${TOKEN_SECRET:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
REGISTRY_SECRET="${REGISTRY_SECRET:-}"

# --- Registry auth realm (must be reachable by Docker clients) ---
REGISTRY_AUTH_REALM="${PUBLIC_URL:-http://localhost:3000}/api/auth/token"

# --- Write registry config (only if Docker is enabled) ---
if [ "${ENABLE_DOCKER:-true}" != "true" ]; then
  echo "[registry-admin] Docker registry disabled — skipping registry config."
else
cat > "$DATA/registry.yml" <<EOF
version: 0.1

log:
  level: warn

storage:
  filesystem:
    rootdirectory: /data/registry
  delete:
    enabled: true
  maintenance:
    uploadpurging:
      enabled: true
      age: 168h
      interval: 24h
      dryrun: false

http:
  addr: :5000
  secret: ${REGISTRY_SECRET}

auth:
  token:
    realm: ${REGISTRY_AUTH_REALM}
    service: docker-registry
    issuer: registry-admin
    rootcertbundle: /data/auth.crt

notifications:
  endpoints:
    - name: admin
      url: http://127.0.0.1:3000/api/webhook/events
      headers:
        Authorization: [Bearer ${WEBHOOK_SECRET}]
      timeout: 5s
      threshold: 1
      backoff: 2s
EOF
fi

# --- Write supervisord env file so Next.js picks up the secrets ---
cat > /tmp/nextjs.env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=/data/db.sqlite
REGISTRY_URL=http://127.0.0.1:5000
MAVEN_ROOT=/data/maven
ENABLE_DOCKER=${ENABLE_DOCKER:-true}
ENABLE_MAVEN=${ENABLE_MAVEN:-true}
REGISTRY_AUTH_REALM=${REGISTRY_AUTH_REALM}
TOKEN_SECRET=${TOKEN_SECRET}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
AUTH_KEY_PATH=/data/auth.key
AUTH_CERT_PATH=/data/auth.crt
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
EOF

# --- Run DB migrations ---
DATABASE_URL="$DATA/db.sqlite" \
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}" \
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
  node /app/scripts/migrate.js

# --- Generate supervisord.conf based on enabled features ---
cat > /tmp/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
pidfile=/tmp/supervisord.pid

[program:nextjs]
command=node /app/server.js
autorestart=true
startretries=5
envfile=/tmp/nextjs.env
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
priority=20
EOF

if [ "${ENABLE_DOCKER:-true}" = "true" ]; then
  cat >> /tmp/supervisord.conf <<'EOF'

[program:registry]
command=/usr/local/bin/registry serve /data/registry.yml
autorestart=true
startretries=5
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
priority=10
EOF
fi

echo "[registry-admin] Starting services (docker=${ENABLE_DOCKER:-true} maven=${ENABLE_MAVEN:-true})..."
exec supervisord -c /tmp/supervisord.conf
