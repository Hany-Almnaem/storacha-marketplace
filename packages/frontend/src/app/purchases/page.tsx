'use client'

import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

interface Purchase {
  id: string
  listingTitle: string
  createdAt: string
  keyDelivered: boolean
}

export default function PurchasesPage() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPurchases = async () => {
      if (!address) return

      try {
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const message = `Fetch my purchases\nTimestamp: ${timestamp}`
        const signature = await signMessageAsync({ message })

        const authHeader = `signature ${address}:${timestamp}:${signature}`

        const res = await fetch(`${API_URL}/api/purchases`, {
          headers: {
            Authorization: authHeader,
          },
        })

        if (!res.ok) {
          throw new Error('Failed to fetch purchases')
        }

        const json = await res.json()
        setPurchases(json.data)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load purchases'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchPurchases()
  }, [address, signMessageAsync])

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Purchases</h1>

        {loading && <div className="text-gray-500">Loading purchases…</div>}

        {error && (
          <div className="bg-red-100 border border-red-200 text-red-700 p-4 rounded mb-4">
            {error}
          </div>
        )}

        {!loading && purchases.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            You haven’t purchased any datasets yet.
          </div>
        )}

        <div className="space-y-4">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 className="font-semibold text-gray-900">
                  {purchase.listingTitle}
                </h2>
                <p className="text-sm text-gray-500">
                  Purchased on{' '}
                  {new Date(purchase.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="mt-4 sm:mt-0">
                {purchase.keyDelivered ? (
                  <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-green-100 text-green-700 rounded-full">
                    Key delivered
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-yellow-100 text-yellow-700 rounded-full">
                    Awaiting key
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
