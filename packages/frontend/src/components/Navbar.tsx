'use client'

import { Database } from 'lucide-react'
import Link from 'next/link'

import { ConnectWallet } from './ConnectWallet'
import { ThemeToggle } from './ThemeToggle'

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Left: Logo + Title */}
        <Link href="/" className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">
            Decentralized Data Marketplace
          </span>
        </Link>

        {/* Right: Controls */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <ConnectWallet />
        </div>
      </div>
    </nav>
  )
}
