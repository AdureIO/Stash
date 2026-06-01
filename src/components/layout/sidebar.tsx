'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Users, Activity, Webhook,
  Trash2, Search, Settings, LogOut, Container, Box,
} from 'lucide-react'
import type { Features } from '@/lib/features'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  feature?: keyof Features
}

const nav: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/repositories', label: 'Docker Images', icon: Package, feature: 'docker' },
  { href: '/packages', label: 'Maven Packages', icon: Box, feature: 'maven' },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, feature: 'docker' },
  { href: '/cleanup', label: 'Cleanup', icon: Trash2, feature: 'docker' },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ features }: { features: Features }) {
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 min-h-screen bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Container size={16} className="text-white" />
        </div>
        <span className="text-white font-semibold text-sm">Registry Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {nav.filter(item => !item.feature || features[item.feature]).map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
