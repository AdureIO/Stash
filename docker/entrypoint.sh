#!/bin/sh
set -e

DATA=/data
mkdir -p "$DATA/registry" "$DATA/maven"

# Fix ownership of the data volume so the stash user can write to it
chown -R stash:stash "$DATA" 2>/dev/null || true

# --- Auth keypair ---
# Both files must exist and belong together. With Swarm >1 replica on one volume,
# parallel boots can otherwise write auth.key and auth.crt from different tasks.
ensure_auth_keypair() {
  lockdir="$DATA/.auth-keypair.lock"
  waited=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    if [ -f "$DATA/auth.key" ] && [ -f "$DATA/auth.crt" ]; then
      return 0
    fi
    waited=$((waited + 1))
    if [ "$waited" -ge 90 ]; then
      echo "[stash] ERROR: timed out waiting for auth keypair (another task may be generating it)"
      exit 1
    fi
    sleep 1
  done

  trap 'rmdir "$lockdir" 2>/dev/null' EXIT INT TERM

  if [ -f "$DATA/auth.key" ] && [ -f "$DATA/auth.crt" ]; then
    rmdir "$lockdir" 2>/dev/null
    trap - EXIT INT TERM
    return 0
  fi

  echo "[stash] Generating auth keypair..."
  rm -f "$DATA/auth.key" "$DATA/auth.crt"

  if ! openssl genpkey -algorithm RSA -out "$DATA/auth.key" -pkeyopt rsa_keygen_bits:4096; then
    echo "[stash] ERROR: openssl failed to create $DATA/auth.key"
    exit 1
  fi
  if ! openssl req -new -x509 -key "$DATA/auth.key" \
    -out "$DATA/auth.crt" -days 3650 -subj "/CN=registry-auth"; then
    echo "[stash] ERROR: openssl failed to create $DATA/auth.crt"
    rm -f "$DATA/auth.key"
    exit 1
  fi

  pub="$DATA/.auth-verify.pub"
  msg="$DATA/.auth-verify.msg"
  sig="$DATA/.auth-verify.sig"
  if ! openssl x509 -in "$DATA/auth.crt" -pubkey -noout > "$pub" \
    || ! printf 'stash-auth-check' > "$msg" \
    || ! openssl dgst -sha256 -sign "$DATA/auth.key" -out "$sig" "$msg" \
    || ! openssl dgst -sha256 -verify "$pub" -signature "$sig" "$msg"; then
    echo "[stash] ERROR: generated auth.key and auth.crt do not verify together"
    rm -f "$DATA/auth.key" "$DATA/auth.crt" "$pub" "$msg" "$sig"
    exit 1
  fi
  rm -f "$pub" "$msg" "$sig"

  rmdir "$lockdir" 2>/dev/null
  trap - EXIT INT TERM
  echo "[stash] Auth keypair ready."
}

ensure_auth_keypair

# --- Trivy binary + vulnerability DBs (persisted on /data, not baked into the image) ---
TRIVY_INSTALL_SOURCED=1
. /app/scripts/trivy-install.sh
ensure_trivy() {
  trivy_setup_env
  if ! trivy_with_lock 1 trivy_bootstrap; then
    echo "[stash] ERROR: Trivy bootstrap failed"
    exit 1
  fi
  export TRIVY_SKIP_DB_UPDATE="${TRIVY_SKIP_DB_UPDATE:-true}"
}
ensure_trivy

# --- Persist secrets to volume so restarts don't kill sessions ---
SECRETS_FILE="$DATA/.secrets"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "TOKEN_SECRET=$(openssl rand -hex 32)" >> "$SECRETS_FILE"
  echo "WEBHOOK_SECRET=$(openssl rand -hex 16)" >> "$SECRETS_FILE"
  echo "REGISTRY_SECRET=$(openssl rand -hex 16)" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
fi

# Load persisted secrets; only non-empty orchestrator overrides win
_override_token="${TOKEN_SECRET:-}"
_override_webhook="${WEBHOOK_SECRET:-}"
_override_registry="${REGISTRY_SECRET:-}"
. "$SECRETS_FILE"
[ -n "$_override_token" ] && TOKEN_SECRET="$_override_token"
[ -n "$_override_webhook" ] && WEBHOOK_SECRET="$_override_webhook"
[ -n "$_override_registry" ] && REGISTRY_SECRET="$_override_registry"
TOKEN_SECRET="${TOKEN_SECRET:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
REGISTRY_SECRET="${REGISTRY_SECRET:-}"

if [ -z "$TOKEN_SECRET" ]; then
  echo "[stash] ERROR: TOKEN_SECRET is empty. Remove /data/.secrets and restart, or set TOKEN_SECRET in the environment."
  exit 1
fi

# --- Public URL (strip trailing slash; drives cookies + Docker auth realm) ---
PUBLIC_URL="${PUBLIC_URL:-http://localhost:3000}"
PUBLIC_URL="${PUBLIC_URL%/}"
REGISTRY_AUTH_REALM="${PUBLIC_URL}/api/auth/token"

# --- Write registry config (only if Docker is enabled) ---
if [ "${ENABLE_DOCKER:-true}" != "true" ]; then
  echo "[stash] Docker registry disabled — skipping registry config."
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
# Restricted permissions — secrets should not be world-readable
# When Docker is enabled, Next.js listens on 3001 and front-proxy owns :3000 for /v2 streaming.
if [ "${ENABLE_DOCKER:-true}" = "true" ]; then
  NEXT_LISTEN_PORT=3001
else
  NEXT_LISTEN_PORT=3000
fi

( umask 077 && cat > /tmp/nextjs.env <<EOF
NODE_ENV=production
PORT=${NEXT_LISTEN_PORT}
HOSTNAME=0.0.0.0
PATH=${PATH}
DATABASE_URL=/data/db.sqlite
PUBLIC_URL=${PUBLIC_URL}
REGISTRY_URL=http://127.0.0.1:5000
MAVEN_ROOT=/data/maven
ENABLE_DOCKER=${ENABLE_DOCKER:-true}
ENABLE_MAVEN=${ENABLE_MAVEN:-true}
STASH_MIGRATED=1
REGISTRY_AUTH_REALM=${REGISTRY_AUTH_REALM}
TOKEN_SECRET=${TOKEN_SECRET}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
REGISTRY_SECRET=${REGISTRY_SECRET}
AUTH_KEY_PATH=/data/auth.key
AUTH_CERT_PATH=/data/auth.crt
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
DATA=/data
TRIVY_VERSION=${TRIVY_VERSION:-0.71.0}
TRIVY_ROOT=${TRIVY_ROOT:-/data/trivy}
TRIVY_CACHE_DIR=${TRIVY_CACHE_DIR}
TRIVY_MODULE_DIR=${TRIVY_MODULE_DIR}
TRIVY_DB_REPOSITORY=${TRIVY_DB_REPOSITORY}
TRIVY_JAVA_DB_REPOSITORY=${TRIVY_JAVA_DB_REPOSITORY}
TRIVY_SKIP_DB_UPDATE=${TRIVY_SKIP_DB_UPDATE}
TRIVY_UPDATE_CRON=${TRIVY_UPDATE_CRON:-15 3 * * *}
TRIVY_UPDATE_BINARY=${TRIVY_UPDATE_BINARY:-false}
EOF
)
chown stash:stash /tmp/nextjs.env

# --- Run DB migrations ---
DATABASE_URL="$DATA/db.sqlite" \
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}" \
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
  node /app/scripts/migrate.js
chown -R stash:stash "$DATA" 2>/dev/null || true

# --- Generate supervisord.conf based on enabled features ---
cat > /tmp/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
pidfile=/data/supervisord.pid

[program:nextjs]
command=node /app/server.js
directory=/app
user=stash
autorestart=true
startretries=5
envfile=/tmp/nextjs.env
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
priority=20
EOF

# Explicit environment= ensures Next.js sees secrets (envfile alone is unreliable in some setups)
cat >> /tmp/supervisord.conf <<EOF
environment=NODE_ENV="production",PORT="${NEXT_LISTEN_PORT}",HOSTNAME="0.0.0.0",PATH="${PATH}",DATA="/data",DATABASE_URL="/data/db.sqlite",PUBLIC_URL="${PUBLIC_URL}",REGISTRY_AUTH_REALM="${REGISTRY_AUTH_REALM}",REGISTRY_URL="http://127.0.0.1:5000",TOKEN_SECRET="${TOKEN_SECRET}",WEBHOOK_SECRET="${WEBHOOK_SECRET}",REGISTRY_SECRET="${REGISTRY_SECRET}",AUTH_KEY_PATH="/data/auth.key",AUTH_CERT_PATH="/data/auth.crt",ENABLE_DOCKER="${ENABLE_DOCKER:-true}",ENABLE_MAVEN="${ENABLE_MAVEN:-true}",STASH_MIGRATED="1",TRIVY_VERSION="${TRIVY_VERSION:-0.71.0}",TRIVY_ROOT="${TRIVY_ROOT:-/data/trivy}",TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR}",TRIVY_MODULE_DIR="${TRIVY_MODULE_DIR}",TRIVY_DB_REPOSITORY="${TRIVY_DB_REPOSITORY}",TRIVY_JAVA_DB_REPOSITORY="${TRIVY_JAVA_DB_REPOSITORY}",TRIVY_SKIP_DB_UPDATE="${TRIVY_SKIP_DB_UPDATE}",TRIVY_UPDATE_BINARY="${TRIVY_UPDATE_BINARY:-false}"
EOF

cat >> /tmp/supervisord.conf <<'EOF'

[program:cron]
command=node /app/scripts/cron.js
directory=/app
user=stash
autorestart=true
startretries=5
envfile=/tmp/nextjs.env
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
priority=30
EOF

if [ "${ENABLE_DOCKER:-true}" = "true" ]; then
  cat >> /tmp/supervisord.conf <<'EOF'

[program:registry]
command=/usr/local/bin/registry serve /data/registry.yml
user=stash
autorestart=true
startretries=5
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
priority=10

[program:front-proxy]
command=node /app/scripts/front-proxy.js
directory=/app
user=stash
autorestart=true
startretries=5
envfile=/tmp/nextjs.env
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
priority=25
EOF

  cat >> /tmp/supervisord.conf <<EOF
environment=PORT="3000",HOSTNAME="0.0.0.0",NEXT_UPSTREAM="http://127.0.0.1:${NEXT_LISTEN_PORT}",REGISTRY_URL="http://127.0.0.1:5000",PUBLIC_URL="${PUBLIC_URL}",REGISTRY_AUTH_REALM="${REGISTRY_AUTH_REALM}"
EOF
fi

# Ensure runtime-generated files under /data are owned by stash
chown -R stash:stash "$DATA" 2>/dev/null || true

echo "[stash] Docker token realm: ${REGISTRY_AUTH_REALM}"
echo "[stash] Starting services (docker=${ENABLE_DOCKER:-true} maven=${ENABLE_MAVEN:-true})..."
# supervisord must run as root so it can spawn dispatchers (/tmp is often noexec in Swarm).
# Each program drops to stash via user= in supervisord.conf.
exec supervisord -c /tmp/supervisord.conf
