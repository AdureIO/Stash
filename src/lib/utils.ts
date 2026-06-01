import { twMerge } from 'tailwind-merge'

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(inputs.filter(Boolean).join(' '))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatRelative(date: string | null): string {
  if (!date) return 'Never'
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

export function shortDigest(digest: string | null): string {
  if (!digest) return '—'
  return digest.replace('sha256:', '').slice(0, 12)
}

export function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('/*')) return value.startsWith(pattern.slice(0, -2))
  return pattern === value
}
