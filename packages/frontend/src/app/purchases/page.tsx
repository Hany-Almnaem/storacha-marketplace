'use client'

import {
  Loader2,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Wallet,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

import { DownloadAccess } from '@/components/DownloadAccess'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

interface Purchase {
  id: string
  listing: {
    title: string
    category: string
  }
  createdAt: string
  keyDelivered: boolean
  keyCid?: string | null
}

export default function PurchasesPage() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [mounted, setMounted] = useState(false)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  async function fetchPurchases() {
    if (!address || !isConnected) return

    setLoading(true)
    setError(null)

    try {
      const timestamp = Date.now().toString()
      const message = `Authenticate to Data Marketplace\nTimestamp: ${timestamp}`
      const signature = await signMessageAsync({ message })

      const authHeader = `signature ${address}:${timestamp}:${signature}`

      const res = await fetch(`${API_URL}/api/purchases`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Failed to fetch purchases')

      const json = await res.json()
      setPurchases(json.purchases ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load purchases.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mounted && isConnected) {
      fetchPurchases()
    }
  }, [mounted, isConnected])

  if (!mounted) return null

  /* ------------------------------------------------ */
  /* 🔌 Not Connected */
  /* ------------------------------------------------ */

  if (!isConnected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <Wallet className="w-10 h-10 text-brand-500 mb-4" />
        <h2 className="text-xl font-semibold text-foreground">
          Connect your wallet
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          You must connect your wallet to view your encrypted dataset purchases.
        </p>
      </main>
    )
  }

  /* ------------------------------------------------ */
  /* 🧱 Main Page */
  /* ------------------------------------------------ */

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
          <h1 className="flex items-center text-3xl font-bold text-foreground">
            <Package className="w-7 h-7 mr-3 text-brand-500" />
            My Purchases
          </h1>

          <button
            onClick={fetchPurchases}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-card/80 transition disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && purchases.length === 0 && !error && (
          <div className="card text-center py-14">
            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              No purchases yet
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              Browse the marketplace and unlock encrypted datasets.
            </p>
          </div>
        )}

        {/* Purchases */}
        <div className="space-y-6">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="card flex flex-col md:flex-row md:items-center md:justify-between gap-6"
            >
              {/* Left */}
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-500">
                  {purchase.listing.category}
                </div>

                <h2 className="text-lg font-semibold text-foreground">
                  {purchase.listing.title}
                </h2>

                <p className="text-xs text-muted-foreground mt-2">
                  Purchased on {new Date(purchase.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Right */}
              <div className="flex items-center gap-4">
                {purchase.keyDelivered ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Key Delivered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full bg-yellow-500/10 px-3 py-1 text-sm font-medium text-yellow-600">
                    <Clock className="w-4 h-4" />
                    Awaiting Key
                  </span>
                )}

                {purchase.keyDelivered && (
                  <DownloadAccess purchaseId={purchase.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
