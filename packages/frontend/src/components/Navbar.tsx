'use client'

import { Database } from 'lucide-react'
import Link from 'next/link'

import { ConnectWallet } from './ConnectWallet'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  { href: '/purchases', label: 'My Purchases' },
  { href: '/sell', label: 'My Listings' },
] as const

function NavLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground ${
            mobile ? 'flex-1 text-center' : ''
          }`}
        >
          {item.label}
        </Link>
      ))}
    </>
  )
}

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-6">
          {/* Left: Logo + Title */}
          <Link href="/" className="flex items-center gap-3">
            <Database className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">
              Decentralized Data Marketplace
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            <NavLinks />
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex shrink-0 items-center gap-4">
          <ThemeToggle />
          <ConnectWallet />
        </div>
      </div>

      {/* Mobile nav */}
      <div className="border-t border-border/60 px-6 py-2 md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <NavLinks mobile />
        </div>
      </div>
    </nav>
  )
}
