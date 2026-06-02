// NPM registry filesystem helpers — artifacts stored at /data/npm
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import path from 'path'

export const NPM_ROOT = process.env.NPM_ROOT || '/data/npm'

export interface NpmPackageVersion {
  name: string
  version: string
  description?: string
  main?: string
  dist: { tarball: string; shasum: string; integrity?: string }
  [key: string]: unknown
}

export interface NpmPackageMeta {
  _id: string
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, NpmPackageVersion>
}

export function safePath(segments: string[]): string | null {
  if (segments.some(s => s.includes('..') || s.includes('\0'))) return null
  const root = path.resolve(NPM_ROOT)
  const resolved = path.resolve(root, ...segments)
  return resolved === root || resolved.startsWith(root + '/') ? resolved : null
}

export function listPackages(): { name: string; versions: string[]; size: number }[] {
  if (!existsSync(NPM_ROOT)) return []
  const results: { name: string; versions: string[]; size: number }[] = []

  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (entry.startsWith('@') && statSync(full).isDirectory()) {
        walk(full, `${entry}/`)
        continue
      }
      if (!statSync(full).isDirectory()) continue
      const pkgName = prefix + entry
      const pkgDir = full
      const versions = readdirSync(pkgDir).filter(v => statSync(path.join(pkgDir, v)).isDirectory())
      if (versions.length === 0) continue
      let size = 0
      versions.forEach(v => {
        try { readdirSync(path.join(pkgDir, v)).forEach(f => { try { size += statSync(path.join(pkgDir, v, f)).size } catch {} }) } catch {}
      })
      results.push({ name: pkgName, versions, size })
    }
  }

  walk(NPM_ROOT, '')
  return results.sort((a, b) => a.name.localeCompare(b.name))
}

export function buildPackageMeta(pkgName: string, baseUrl: string): NpmPackageMeta | null {
  const pkgDir = safePath([pkgName])
  if (!pkgDir || !existsSync(pkgDir)) return null

  const versions: Record<string, NpmPackageVersion> = {}
  let latest = ''

  for (const version of readdirSync(pkgDir)) {
    const vDir = path.join(pkgDir, version)
    if (!statSync(vDir).isDirectory()) continue

    const pkgJsonPath = path.join(vDir, 'package.json')
    let pkgJson: Record<string, unknown> = {}
    if (existsSync(pkgJsonPath)) {
      try { pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) } catch {}
    }

    const tgzName = `${pkgName.replace('/', '-')}-${version}.tgz`
    const tgzPath = path.join(vDir, tgzName)
    const shasum = existsSync(tgzPath)
      ? createHash('sha1').update(readFileSync(tgzPath)).digest('hex')
      : ''

    versions[version] = {
      name: pkgName,
      version,
      description: pkgJson.description as string || '',
      ...pkgJson,
      dist: {
        tarball: `${baseUrl}/api/npm/${pkgName}/-/${tgzName}`,
        shasum,
      },
    }
    latest = version
  }

  if (Object.keys(versions).length === 0) return null
  return { _id: pkgName, name: pkgName, 'dist-tags': { latest }, versions }
}

export function writePackageVersion(pkgName: string, version: string, tgzBuffer: Buffer, pkgJson: Record<string, unknown>) {
  const vDir = safePath([pkgName, version])
  if (!vDir) throw new Error('Invalid path')
  mkdirSync(vDir, { recursive: true })
  const tgzName = `${pkgName.replace(/\//g, '-')}-${version}.tgz`
  writeFileSync(path.join(vDir, tgzName), tgzBuffer)
  writeFileSync(path.join(vDir, 'package.json'), JSON.stringify(pkgJson, null, 2))
}
