'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

import { buildAuthHeader } from '@/lib/authHeader'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

export interface Purchase {
  id: string
  buyerAddress: string
  amountUsdc: string
  createdAt: string
}

export interface Listing {
  id: string
  onchainId: number
  title: string
  description: string
  category: string
  priceUsdc: string
  sellerAddress: string
  salesCount?: number
  purchases?: Purchase[]
}

export function useListingDetail(id: string) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchListing = useCallback(async () => {
    setLoading(true)

    try {
      let headers: HeadersInit = {}

      if (isConnected && address) {
        try {
          const authHeader = await buildAuthHeader(
            address,
            signMessageAsync,
            'listing'
          )
          headers = { Authorization: authHeader }
        } catch {
          // user rejected signature → continue as guest
        }
      }

      const res = await fetch(`${API_URL}/api/listings/${id}`, {
        headers,
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Failed to fetch listing')

      const json = await res.json()
      setListing(json.listing)
    } catch (err: any) {
      setError(err.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }, [id, address, isConnected, signMessageAsync])

  useEffect(() => {
    fetchListing()
  }, [fetchListing])

  return { listing, loading, error, refetch: fetchListing }
}
