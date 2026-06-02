'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Users, Activity, Webhook,
  Trash2, Search, Settings, LogOut, Box,
  Key, ShieldCheck, BarChart2, BookOpen, Shield, Users2, FileText,
} from 'lucide-react'
import type { Features } from '@/lib/features'

interface NavLink {
  type: 'link'
  href: string
  label: string
  icon: React.ElementType
  feature?: keyof Features
}

interface NavSection {
  type: 'section'
  label: string
}

type NavItem = NavLink | NavSection

function buildNav(features: Features): NavItem[] {
  const items: NavItem[] = [
    { type: 'link', href: '/', label: 'Dashboard', icon: LayoutDashboard },

    { type: 'section', label: 'Registries' },
    ...(features.docker ? [{ type: 'link' as const, href: '/repositories', label: 'Docker Images', icon: Package }] : []),
    ...(features.maven  ? [{ type: 'link' as const, href: '/packages',     label: 'Maven Packages', icon: BookOpen }] : []),
    ...(features.npm    ? [{ type: 'link' as const, href: '/npm',          label: 'NPM Packages',   icon: Box }] : []),

    { type: 'section', label: 'Access' },
    { type: 'link', href: '/users',  label: 'Users',         icon: Users },
    { type: 'link', href: '/groups', label: 'Groups',        icon: Users2 },
    { type: 'link', href: '/tokens', label: 'Access Tokens', icon: Key },

    { type: 'section', label: 'Operations' },
    { type: 'link', href: '/activity', label: 'Activity',  icon: Activity },
    { type: 'link', href: '/audit',    label: 'Audit Log', icon: FileText },
    { type: 'link', href: '/security', label: 'Security',  icon: ShieldCheck },
    { type: 'link', href: '/storage',  label: 'Storage',   icon: BarChart2 },

    { type: 'section', label: 'Configuration' },
    ...(features.docker ? [
      { type: 'link' as const, href: '/webhooks', label: 'Webhooks', icon: Webhook },
      { type: 'link' as const, href: '/cleanup',  label: 'Cleanup',  icon: Trash2 },
    ] : []),
    { type: 'link', href: '/search',   label: 'Search',   icon: Search },
    { type: 'link', href: '/settings', label: 'Settings', icon: Settings },
  ]
  return items
}

export function Sidebar({ features }: { features: Features }) {
  const pathname = usePathname()
  const navItems = buildNav(features)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className="w-[220px] min-h-screen bg-zinc-950 flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-zinc-800/60">
        <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center shrink-0">
          <Shield size={14} className="text-white" />
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">Depot</span>
        <span className="ml-auto text-[10px] font-medium text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 leading-none">
          v0.1
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item, i) => {
          if (item.type === 'section') {
            return (
              <p key={`section-${i}`} className="px-4 pt-4 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                {item.label}
              </p>
            )
          }

          const { href, label, icon: Icon } = item
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={[
                'sidebar-text flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors',
                active
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
              ].join(' ')}
            >
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-zinc-800/60">
        <button
          onClick={handleLogout}
          className="sidebar-text w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 transition-colors"
        >
          <LogOut size={14} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
