'use client'

import {
  Loader2,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  Wallet,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

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

  const fetchPurchases = async () => {
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
      })

      if (!res.ok) {
        throw new Error('Failed to fetch purchases')
      }

      const json = await res.json()
      setPurchases(json.purchases ?? [])
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while loading purchases.'
      )
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

  if (!isConnected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <Wallet className="w-10 h-10 text-blue-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">
          Connect your wallet
        </h2>
        <p className="text-gray-500 mt-2">
          You need to connect your wallet to view purchases.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Package className="w-7 h-7 mr-3 text-blue-600" />
            My Purchases
          </h1>

          <button
            onClick={fetchPurchases}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 mr-3" />
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && purchases.length === 0 && !error && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
            <Package className="w-10 h-10 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">
              No purchases yet
            </h3>
            <p className="text-gray-500 mt-2">
              Browse the marketplace and purchase datasets.
            </p>
          </div>
        )}

        {/* Purchase Cards */}
        <div className="space-y-6">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center md:justify-between"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {purchase.listing.title}
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  Category: {purchase.listing.category}
                </p>

                <p className="text-xs text-gray-400 mt-2">
                  Purchased on {new Date(purchase.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="mt-4 md:mt-0 flex items-center space-x-4">
                {purchase.keyDelivered ? (
                  <span className="flex items-center px-3 py-1 text-sm font-medium bg-green-100 text-green-700 rounded-full">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Key Delivered
                  </span>
                ) : (
                  <span className="flex items-center px-3 py-1 text-sm font-medium bg-yellow-100 text-yellow-700 rounded-full">
                    <Clock className="w-4 h-4 mr-1" />
                    Awaiting Key
                  </span>
                )}

                {purchase.keyDelivered && (
                  <button
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    onClick={() =>
                      alert('Implement decrypt & download flow here.')
                    }
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Access
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
