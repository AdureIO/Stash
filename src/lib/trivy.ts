// Trivy vulnerability scanner integration
// Uses spawnSync with separate args — never interpolates user input into shell strings
import { spawnSync } from 'child_process'

export interface Vulnerability {
  VulnerabilityID: string
  PkgName: string
  InstalledVersion: string
  FixedVersion?: string
  Severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  Title?: string
}

export interface ScanSummary {
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
  vulns: Vulnerability[]
}

// Validate image reference — only allow safe characters
function validateImageRef(value: string, label: string): void {
  if (!/^[a-z0-9._:/@-]+$/i.test(value)) {
    throw new Error(`Invalid ${label}: contains disallowed characters`)
  }
  if (value.length > 256) throw new Error(`${label} too long`)
}

export async function scanImage(
  registryUrl: string,
  repo: string,
  tag: string,
): Promise<ScanSummary & { raw: string }> {
  // Validate inputs before building the image reference
  validateImageRef(repo, 'repository')
  validateImageRef(tag, 'tag')

  const host = registryUrl.replace(/^https?:\/\//, '')
  validateImageRef(host, 'registry host')

  const image = `${host}/${repo}:${tag}`

  // Use spawnSync with separate args array — no shell interpolation
  const result = spawnSync(
    'trivy',
    ['image', '--format', 'json', '--quiet', '--no-progress', '--insecure', image],
    {
      timeout: 120_000,
      encoding: 'utf8',
      env: { ...process.env, TRIVY_INSECURE: 'true' },
      shell: false, // explicit: never use shell
    },
  )

  // Trivy exits non-zero when vulnerabilities found — stdout is still valid JSON
  const raw = result.stdout || ''
  if (!raw && result.error) throw new Error(`trivy exec failed: ${result.error.message}`)
  if (!raw && result.status !== 0) throw new Error(`trivy exited ${result.status}: ${result.stderr || 'no output'}`)

  const parsed = JSON.parse(raw) as { Results?: { Vulnerabilities?: Vulnerability[] }[] }
  const vulns: Vulnerability[] = parsed.Results?.flatMap(r => r.Vulnerabilities ?? []) ?? []

  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
  for (const v of vulns) {
    const key = v.Severity.toLowerCase() as keyof typeof counts
    counts[key] = (counts[key] ?? 0) + 1
  }

  return { ...counts, vulns, raw }
}
