import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Registry Admin',
  description: 'Docker Registry Administration Panel',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
