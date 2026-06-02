import { execSync } from 'child_process'

export interface GcResult {
  ok: boolean
  output: string
  dryRun: boolean
}

export async function runGarbageCollection(dryRun = false): Promise<GcResult> {
  const args = dryRun ? '--dry-run' : '--delete-untagged'
  try {
    // Stop registry, run GC, restart — requires supervisorctl
    let output = ''
    if (!dryRun) {
      try { execSync('supervisorctl -c /tmp/supervisord.conf stop registry', { timeout: 10000 }) } catch {}
    }
    output = execSync(
      `/usr/local/bin/registry garbage-collect ${args} /data/registry.yml 2>&1`,
      { timeout: 300000, encoding: 'utf8' }
    )
    if (!dryRun) {
      try { execSync('supervisorctl -c /tmp/supervisord.conf start registry', { timeout: 10000 }) } catch {}
    }
    return { ok: true, output, dryRun }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err), dryRun }
  }
}
