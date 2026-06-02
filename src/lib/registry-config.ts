// Regenerate /data/registry.yml at runtime (e.g., after read-only toggle)
import { writeFileSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

const CONFIG_PATH = '/data/registry.yml'

export function regenerateConfig(readonly: boolean) {
  const registrySecret = process.env.REGISTRY_SECRET || 'registry-secret'
  const webhookSecret = process.env.WEBHOOK_SECRET || 'webhook-secret'
  const authRealm = (process.env.PUBLIC_URL || 'http://localhost:3000') + '/api/auth/token'
  const port = process.env.PORT || '3000'

  const cfg = `version: 0.1
log:
  level: warn
storage:
  filesystem:
    rootdirectory: /data/registry
  delete:
    enabled: true
  maintenance:
    readOnly:
      enabled: ${readonly}
    uploadpurging:
      enabled: true
      age: 168h
      interval: 24h
      dryrun: false
http:
  addr: :5000
  secret: ${registrySecret}
auth:
  token:
    realm: ${authRealm}
    service: docker-registry
    issuer: registry-admin
    rootcertbundle: /data/auth.crt
notifications:
  endpoints:
    - name: admin
      url: http://127.0.0.1:${port}/api/webhook/events
      headers:
        Authorization: [Bearer ${webhookSecret}]
      timeout: 5s
      threshold: 1
      backoff: 2s
`
  writeFileSync(CONFIG_PATH, cfg)

  // Signal supervisord to restart registry if available
  try { execSync('supervisorctl -c /tmp/supervisord.conf restart registry', { timeout: 10000, stdio: 'pipe' }) } catch {}
}
