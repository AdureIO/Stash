# Stash

Self-hosted Docker, Maven, and NPM artifact registry with a public catalog and admin panel.

Stash combines:

- A **public catalog** at `/` for browsing and pulling shared packages (no sign-in required).
- An **admin panel** at `/dashboard` for users, groups, policies, tokens, cleanup, and audit data.
- A Docker Registry v2-compatible endpoint (`/v2/*`) with token auth.
- Maven package endpoints (`/api/maven/*`).
- NPM registry endpoints (`/api/npm/*`).

![Stash public catalog — screenshot placeholder](docs/screenshots/portal-catalog.png)

> **Screenshot:** Add `docs/screenshots/portal-catalog.png` (recommended ~1440×900, **dark theme**) showing the public catalog with Docker, Maven, and/or NPM sections.

## Brand identity

Stash uses a consistent, product-first visual language across the public catalog and admin panel.

| Element              | Usage                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logo**             | Blue rounded mark with stacked layers + “Stash” wordmark (`StashLogo` component)                                                            |
| **Primary palette**  | **Public catalog:** `zinc-950` / `zinc-900` surfaces, `zinc-100` text, blue accent · **Admin panel:** `zinc-50` content, `zinc-950` sidebar |
| **Registry accents** | Docker → blue · Maven → purple · NPM → emerald (icons and hover states only)                                                                |
| **Typography**       | System sans-serif for UI; monospace for package names, coords, and digests                                                                  |
| **Public catalog**   | Dark (default) or **light mode** via header toggle — preference saved in `localStorage`; respects system theme on first visit               |
| **Admin panel**      | Dark sidebar (`zinc-950`) + light content area; same logo and accent colors                                                                 |

Public resources can be marked **public pull** in the admin panel; anonymous users can browse the catalog and pull/install without credentials. Push and publish always require authentication.

## Why Stash

- Run your own package infrastructure on one URL.
- Manage users and access rules from a single panel.
- Keep Docker-compatible token auth with a simple self-hosted deployment.
- Use SQLite by default, or PostgreSQL via `DATABASE_URL`.

## Core Features

- **Public catalog** — landing page at `/` lists Docker images, Maven artifacts, and NPM packages marked public pull.
- **Per-resource visibility** — admins toggle public pull vs private on each image, Maven artifact, or NPM package.
- Docker Registry proxy and token issuer.
- Maven and NPM package hosting endpoints.
- User management with role-based access.
- Group-based policy/rule management.
- Personal access tokens and scope metadata.
- Webhook ingestion and event/audit history.
- Cleanup rules and on-demand cleanup execution.
- Optional TOTP and SSO provider settings.

## Architecture Overview

- **Frontend + API:** Next.js app serving UI and API routes on port `3000`.
- **Docker Registry:** `registry:2` binary runs inside the same container when Docker support is enabled.
- **Storage:** `/data` volume for database, registry data, maven artifacts, auth keys, and generated secrets.
- **Database:**
    - SQLite by default (`/data/db.sqlite`).
    - PostgreSQL supported via `DATABASE_URL=postgresql://...`.

## Requirements

- Docker (recommended deployment path), or:
- Node.js `22+` and npm for local development.

## Quick Start (Docker)

### Build

```bash
docker buildx build --platform linux/amd64 -t adureio/stash:latest --push .
```

```bash
docker run -d \
  --name stash \
  -p 3000:3000 \
  -v stash_data:/data \
  -e PUBLIC_URL=http://localhost:3000 \
  adureio/stash:local
```

Open `http://localhost:3000` — you land on the **public catalog**. Sign in via **Sign in** (top right) to reach the admin **dashboard** at `/dashboard`.

On first boot, an admin user is created automatically. If `ADMIN_PASSWORD` is not set, a generated password is printed to container logs.

### Migrate from Docker Registry (`registry:2`) with Compose

If you already run Docker Distribution (`registry:2`) and want to reuse existing images, mount the old registry storage at `/data/registry` in Stash.

`/data/registry` is the registry blob/manifests path used by Stash's embedded registry process.

Example `docker-compose.yml`:

```yaml
services:
    stash:
        image: adureio/stash:local
        ports:
            - "3000:3000"
        environment:
            PUBLIC_URL: http://localhost:3000
        volumes:
            - stash_data:/data
            - /path/to/old-registry-data:/data/registry

volumes:
    stash_data:
```

If your old registry data is in a named Docker volume:

```yaml
services:
    stash:
        image: adureio/stash:local
        volumes:
            - stash_data:/data
            - old_registry_volume:/data/registry

volumes:
    stash_data:
    old_registry_volume:
        external: true
```

Migration checklist:

- Stop writes to the old registry before cutover.
- Confirm old storage uses Docker Distribution filesystem layout.
- Keep `/data` persisted for Stash app data (DB, secrets, auth keys).
- Start Stash with Compose (`docker compose up -d --build`) and verify pulls from existing repositories.

## Local Development

1. Install dependencies:

```bash
npm ci
```

2. Copy environment template:

```bash
cp .env.example .env.local
```

3. Run migrations/bootstrap:

```bash
npm run migrate
```

4. Start development server:

```bash
npm run dev
```

## Build and Run (Production)

```bash
npm run build
npm run start
```

## Environment Variables

### Core

- `PUBLIC_URL`  
  Public base URL used for registry auth realm and generated snippets.
- `DATABASE_URL`  
  SQLite file path or PostgreSQL connection string.

### Feature Flags

- `ENABLE_DOCKER` (`true` by default)
- `ENABLE_MAVEN` (`true` by default)
- `ENABLE_NPM` (`true` by default)

### Admin Bootstrap

- `ADMIN_USERNAME` (default: `admin`)
- `ADMIN_PASSWORD` (optional; autogenerated if empty on first boot)

### Security/Secrets

- `TOKEN_SECRET`
- `WEBHOOK_SECRET`
- `REGISTRY_SECRET`
- `AUTH_KEY_PATH`
- `AUTH_CERT_PATH`

In container deployments, secrets and auth key material are generated and persisted under `/data` on first boot when not explicitly provided.

### Storage Paths

- `REGISTRY_URL` (internal registry upstream URL; default `http://127.0.0.1:5000`)
- `MAVEN_ROOT` (default `/data/maven`)
- `NPM_ROOT` (default `/data/npm`)

## Docker CLI Login

Use a **Stash user** (from the admin panel) or a **personal access token** — not Docker Hub credentials.

```bash
docker login hub.example.com -u admin -p '<password>'
# or with a PAT (create in Stash → Tokens):
docker login hub.example.com -u token -p 'ra_...'
```

Required environment on the server:

- `PUBLIC_URL=https://hub.example.com` (must match the URL clients use; drives the auth `realm` in `registry.yml`)

Having `PUBLIC_URL` set is necessary but not sufficient. After deploy, verify auth wiring:

```bash
curl -s https://hub.example.com/api/health | jq
```

Expect `"ok": true`, `"registry_jwt_sign": "ok"`, and `"token_secret_set": true`.

**Swarm:** mount the same `/data` volume on every replica, or run **one replica** for SQLite. If multiple tasks share `/data` and start at the same time, they can race on `auth.key` / `auth.crt` and break Docker login until both files are removed and only one task generates them (recent images use a volume lock to prevent this).

If login still fails after deploy, reset the admin password once:

```yaml
ADMIN_PASSWORD: "choose-a-strong-password"
ADMIN_RESET_PASSWORD: "true"
```

Remove `ADMIN_RESET_PASSWORD` after one successful restart.

After changing `PUBLIC_URL`, redeploy/restart the container so the registry reloads config. On startup, logs show:

`[stash] Docker token realm: https://hub.example.com/api/auth/token`

## Registry/API Surfaces

- Public catalog (UI): `/` and `/portal/docker/*`, `/portal/maven/*`, `/portal/npm/*`
- Admin dashboard: `/dashboard`
- Docker v2: `/v2/*`
- Docker token endpoint: `/api/auth/token`
- Maven: `/api/maven/*`
- NPM: `/api/npm/*`
- Webhook ingest: `/api/webhook/events`

## Data Persistence

Persist `/data` to keep:

- Database (`db.sqlite`) if using SQLite.
- Docker registry blobs.
- Maven/NPM package files.
- Generated auth keypair.
- Persisted runtime secrets.

Without persistent `/data`, credentials and secrets can rotate unexpectedly between restarts.

## Reverse proxy (Docker push)

Stash listens on **port 3000** in the container (front-proxy when Docker is enabled). Point Traefik (or nginx) at that port, not the internal Next.js port.

Set `PUBLIC_URL` to the exact URL clients use (e.g. `https://hub.adure.io`) so the Docker auth `realm` and upload `Location` headers match Traefik’s hostname.

### Traefik

Layer uploads can run for many minutes. If entrypoint or transport timeouts are too low, `docker push` fails mid-upload (often **499**, **408**, or **502** depending on the proxy).

**Static config** — relax timeouts on the HTTPS entrypoint (adjust names to match your setup):

```yaml
entryPoints:
    websecure:
        address: ":443"
        transport:
            respondingTimeouts:
                readTimeout: 0 # 0 = no read timeout (Traefik v2/v3)
                writeTimeout: 0
                idleTimeout: 1800s # 30m idle during large pushes
```

**Docker / Compose labels** — route to Stash on port 3000; avoid a buffering middleware on this router (buffering caps body size and breaks registry uploads):

```yaml
labels:
    - traefik.enable=true
    - traefik.http.routers.stash.rule=Host(`hub.example.com`)
    - traefik.http.routers.stash.entrypoints=websecure
    - traefik.http.routers.stash.tls=true
    - traefik.http.services.stash.loadbalancer.server.port=3000
    # optional: stream registry responses instead of buffering
    - traefik.http.services.stash.loadbalancer.responseForwarding.flushInterval=100ms
```

If you use a **ServersTransport** for long backend reads, raise `forwardingTimeouts.idleConnTimeout` (e.g. `1800s`) and avoid a short `responseHeaderTimeout`.

Traefik forwards `X-Forwarded-Proto` / `Host` by default; Stash uses those when rewriting registry `Location` headers if needed.

### nginx

```nginx
location /v2/ {
    proxy_pass http://stash:3000;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 0;
    proxy_request_buffering off;
}
```

## Security Notes

- Configure strong explicit values for all secret environment variables in production.
- Run behind TLS (reverse proxy or ingress).
- Limit network access to trusted clients and operators.
- Review `SECURITY-REPORT.md` and keep dependencies up to date.

## Contributing Policy

Please read `CONTRIBUTING.md`.

We welcome improvements from everyone and request that organizations running modified SaaS/self-hosted deployments upstream important bug fixes and security fixes back to this repository when possible.

## License

Licensed under the MIT License (`MIT`).

See `LICENSE` for the full text.
