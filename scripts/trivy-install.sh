#!/bin/sh
# Install or update Trivy binary + vulnerability DBs under /data/trivy.
# Usage: trivy-install.sh bootstrap | update
#   bootstrap — first boot: download only if missing (entrypoint)
#   update    — scheduled: refresh DBs; re-download binary when TRIVY_VERSION changes

set -e

DATA="${DATA:-/data}"

trivy_setup_env() {
  TRIVY_VERSION="${TRIVY_VERSION:-0.71.0}"
  TRIVY_ROOT="${TRIVY_ROOT:-$DATA/trivy}"
  TRIVY_BIN="$TRIVY_ROOT/bin/trivy"
  TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR:-$TRIVY_ROOT/cache}"
  TRIVY_MODULE_DIR="${TRIVY_MODULE_DIR:-$TRIVY_ROOT/modules}"
  TRIVY_VERSION_FILE="$TRIVY_ROOT/.installed-version"
  export TRIVY_VERSION TRIVY_ROOT TRIVY_BIN TRIVY_CACHE_DIR TRIVY_MODULE_DIR
  export TRIVY_DB_REPOSITORY="${TRIVY_DB_REPOSITORY:-public.ecr.aws/aquasecurity/trivy-db:2,ghcr.io/aquasecurity/trivy-db:2}"
  export TRIVY_JAVA_DB_REPOSITORY="${TRRIVY_JAVA_DB_REPOSITORY:-public.ecr.aws/aquasecurity/trivy-java-db:1,ghcr.io/aquasecurity/trivy-java-db:1}"
  export PATH="$TRIVY_ROOT/bin:${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"
  mkdir -p "$TRIVY_ROOT/bin" "$TRIVY_CACHE_DIR" "$TRIVY_MODULE_DIR"
}

trivy_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "Linux-64bit" ;;
    aarch64|arm64) echo "Linux-ARM64" ;;
    *)
      echo "[trivy] ERROR: unsupported architecture: $(uname -m)" >&2
      return 1
      ;;
  esac
}

trivy_download_binary() {
  force="${1:-0}"
  if [ "$force" != "1" ] && [ -x "$TRIVY_BIN" ] && [ -f "$TRIVY_VERSION_FILE" ] \
    && [ "$(cat "$TRIVY_VERSION_FILE")" = "$TRIVY_VERSION" ]; then
    return 0
  fi

  trivy_arch="$(trivy_arch)" || return 1
  echo "[trivy] Downloading Trivy ${TRIVY_VERSION} (${trivy_arch})..."
  url="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_${trivy_arch}.tar.gz"
  tmp="$TRIVY_ROOT/.trivy-download.tar.gz"
  if ! curl -sfL "$url" -o "$tmp"; then
    echo "[trivy] ERROR: failed to download from $url" >&2
    rm -f "$tmp"
    return 1
  fi
  extract="$TRIVY_ROOT/.trivy-extract"
  rm -rf "$extract"
  mkdir -p "$extract"
  if ! tar -xzf "$tmp" -C "$extract" trivy; then
    echo "[trivy] ERROR: failed to extract binary" >&2
    rm -f "$tmp"
    rm -rf "$extract"
    return 1
  fi
  rm -f "$tmp"
  chmod 755 "$extract/trivy"
  mv -f "$extract/trivy" "$TRIVY_BIN"
  rm -rf "$extract"
  printf '%s\n' "$TRIVY_VERSION" > "$TRIVY_VERSION_FILE"
  echo "[trivy] Binary ready (${TRIVY_VERSION})."
}

trivy_download_dbs() {
  force="${1:-0}"
  if [ ! -x "$TRIVY_BIN" ]; then
    echo "[trivy] ERROR: Trivy binary not installed" >&2
    return 1
  fi

  need_vuln=0
  need_java=0
  if [ "$force" = "1" ]; then
    need_vuln=1
    need_java=1
  else
    [ ! -f "$TRIVY_CACHE_DIR/trivy.db" ] && need_vuln=1
    [ ! -d "$TRIVY_CACHE_DIR/java-db" ] && need_java=1
  fi

  if [ "$need_vuln" = "0" ] && [ "$need_java" = "0" ]; then
    return 0
  fi

  echo "[trivy] Downloading vulnerability databases..."
  unset TRIVY_SKIP_DB_UPDATE
  if [ "$need_vuln" = "1" ]; then
    "$TRIVY_BIN" image --download-db-only --no-progress || {
      echo "[trivy] ERROR: vuln DB download failed" >&2
      return 1
    }
  fi
  if [ "$need_java" = "1" ]; then
    "$TRIVY_BIN" image --download-java-db-only --no-progress || {
      echo "[trivy] ERROR: Java DB download failed" >&2
      return 1
    }
  fi
  echo "[trivy] Databases ready."
}

trivy_chown() {
  chown -R stash:stash "$TRIVY_ROOT" 2>/dev/null || true
}

trivy_with_lock() {
  # 1 = bootstrap may return early when another task already installed
  allow_ready_skip="${1:-0}"
  shift

  lockdir="$DATA/.trivy-install.lock"
  waited=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    if [ "$allow_ready_skip" = "1" ] && [ -x "$TRIVY_BIN" ] \
      && [ -f "$TRIVY_CACHE_DIR/trivy.db" ] && [ -d "$TRIVY_CACHE_DIR/java-db" ]; then
      return 0
    fi
    waited=$((waited + 1))
    if [ "$waited" -ge 600 ]; then
      echo "[trivy] ERROR: timed out waiting for install lock" >&2
      return 1
    fi
    sleep 1
  done

  trap 'rmdir "$lockdir" 2>/dev/null' EXIT INT TERM
  "$@"
  status=$?
  trivy_chown
  rmdir "$lockdir" 2>/dev/null
  trap - EXIT INT TERM
  return "$status"
}

trivy_bootstrap() {
  trivy_download_binary 0 || return 1
  trivy_download_dbs 0 || return 1
  export TRIVY_SKIP_DB_UPDATE="${TRIVY_SKIP_DB_UPDATE:-true}"
  return 0
}

trivy_update() {
  # Re-fetch binary when TRIVY_VERSION changes (or TRIVY_UPDATE_BINARY=true)
  force_bin=0
  if [ "${TRIVY_UPDATE_BINARY:-false}" = "true" ]; then
    force_bin=1
  fi
  if [ ! -f "$TRIVY_VERSION_FILE" ] || [ "$(cat "$TRIVY_VERSION_FILE" 2>/dev/null)" != "$TRIVY_VERSION" ]; then
    force_bin=1
  fi
  trivy_download_binary "$force_bin" || return 1
  trivy_download_dbs 1 || return 1
  return 0
}

trivy_run() {
  trivy_setup_env
  case "$1" in
    bootstrap)
      trivy_with_lock 1 trivy_bootstrap
      ;;
    update)
      trivy_with_lock 0 trivy_update
      ;;
    *)
      echo "Usage: $0 bootstrap|update" >&2
      return 1
      ;;
  esac
}

if [ "${TRIVY_INSTALL_SOURCED:-}" != "1" ]; then
  trivy_run "$@"
fi
