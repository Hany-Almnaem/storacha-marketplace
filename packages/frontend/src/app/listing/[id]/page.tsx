'use client'

import {
  ArrowLeft,
  ShieldCheck,
  Tag,
  User,
  Wallet,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

import BuyButton from '@/components/BuyButton'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

interface Purchase {
  id: string
  buyerAddress: string
  amountUsdc: string
  createdAt: string
}

interface Listing {
  id: string
  onchainId: number
  title: string
  description: string
  category: string
  priceUsdc: string
  sellerAddress: string
  salesCount?: number
  purchases?: Purchase[] // Only returned if user is the seller
}

const ListingDetailPage = ({ params }: { params: { id: string } }) => {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchListing = useCallback(async () => {
    setLoading(true)
    try {
      let authHeader = ''

      // 1. If connected, sign the message to prove identity to the backend
      if (isConnected && address) {
        const timestamp = Date.now().toString()
        const message = `Create listing on Data Marketplace\nTimestamp: ${timestamp}`

        try {
          const signature = await signMessageAsync({ message })
          // 2. Format as per backend requirement: signature address:timestamp:signature
          authHeader = `signature ${address}:${timestamp}:${signature}`
        } catch (signErr) {
          console.error('User rejected signature or signing failed', signErr)
          // We continue without header; backend will treat as guest
        }
      }

      const res = await fetch(`${API_URL}/api/listings/${params.id}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Failed to fetch listing details')

      const json = await res.json()
      setListing(json.listing)
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [address, isConnected, params.id, signMessageAsync])

  useEffect(() => {
    fetchListing()
  }, [fetchListing])

  // --- Render States ---

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">
          Authenticating & loading dataset...
        </p>
      </div>
    )
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-red-100 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-6">{error || 'Listing not found'}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-gray-900 text-white py-2 rounded-lg hover:bg-gray-800 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const isOwner = listing.purchases !== undefined

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Navigation */}
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-8 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Marketplace
        </Link>

        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
          {/* Header Section */}
          <div className="p-8 border-b border-gray-100">
            <div className="flex items-center space-x-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider flex items-center">
                <Tag className="w-3 h-3 mr-1" />
                {listing.category}
              </span>
              {isOwner && (
                <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold uppercase tracking-wider flex items-center">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  You are the Seller
                </span>
              )}
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
              {listing.title}
            </h1>
          </div>

          <div className="p-8">
            {/* Description */}
            <div className="mb-10">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
                Description
              </h3>
              <p className="text-gray-700 text-lg leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <div className="flex items-center text-gray-500 mb-2">
                  <Wallet className="w-4 h-4 mr-2" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Price
                  </span>
                </div>
                <p className="text-2xl font-black text-gray-900">
                  {Number(listing.priceUsdc).toLocaleString()}{' '}
                  <span className="text-blue-600">USDC</span>
                </p>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <div className="flex items-center text-gray-500 mb-2">
                  <User className="w-4 h-4 mr-2" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Seller Address
                  </span>
                </div>
                <p className="text-sm font-mono text-gray-600 truncate">
                  {listing.sellerAddress}
                </p>
              </div>
            </div>

            {/* Seller Dashboard (Only visible if signature verified address as owner) */}
            {isOwner && (
              <div className="mb-10 p-6 bg-blue-50 rounded-2xl border border-blue-100">
                <h3 className="text-blue-900 font-bold mb-4 flex items-center">
                  <ShieldCheck className="w-5 h-5 mr-2" />
                  Seller Statistics
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">
                      Total Sales
                    </p>
                    <p className="text-xl font-bold">{listing.salesCount}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Revenue</p>
                    <p className="text-xl font-bold text-green-600">
                      {(
                        Number(listing.priceUsdc) * (listing.salesCount || 0)
                      ).toFixed(2)}{' '}
                      USDC
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* CTA Section */}
            <div className="pt-8 border-t border-gray-100">
              {!isConnected ? (
                <div className="text-center p-6 bg-orange-50 rounded-2xl border border-orange-100">
                  <p className="text-orange-800 font-medium mb-2">
                    Wallet Disconnected
                  </p>
                  <p className="text-sm text-orange-600">
                    Please connect your wallet to purchase this dataset.
                  </p>
                </div>
              ) : isOwner ? (
                <div className="text-center p-6 bg-gray-100 rounded-2xl border border-gray-200">
                  <p className="text-gray-600 font-medium">
                    This is your listing. You cannot purchase it.
                  </p>
                </div>
              ) : (
                <BuyButton
                  onchainId={listing.onchainId}
                  priceUsdc={listing.priceUsdc}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer Meta */}
        <div className="mt-8 flex items-center justify-center space-x-4 text-gray-400">
          <div className="flex items-center text-xs">
            <ShieldCheck className="w-3 h-3 mr-1 text-green-500" />
            End-to-End Encrypted
          </div>
          <span className="text-gray-300">•</span>
          <div className="text-xs italic text-center">
            Datasets are stored on Storacha. Decryption keys delivered
            post-purchase.
          </div>
        </div>
      </div>
    </main>
  )
}

export default ListingDetailPage
