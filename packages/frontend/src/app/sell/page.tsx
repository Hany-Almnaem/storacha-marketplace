'use client'

import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useReadContract, useSignMessage } from 'wagmi'

import { KeyDeliveryPanel } from '@/components/KeyDeliveryPanel'
import { WithdrawalButton } from '@/components/WithdrawalButton'
import { buildAuthHeader } from '@/lib/authHeader'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const MARKETPLACE_ADDRESS =
  (process.env['NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS'] as `0x${string}`) ||
  ZERO_ADDRESS

const MARKETPLACE_READ_ABI = [
  {
    name: 'getListingBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_listingId', type: 'uint256' }],
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'firstPurchaseTime', type: 'uint256' },
    ],
  },
] as const

interface SellerListing {
  id: string
  title: string
  category: string
  priceUsdc: string
  salesCount: number
  createdAt: string
  onchainId: number | null
}

interface RawSellerListing {
  id: string
  title: string
  category: string
  priceUsdc: string
  salesCount: number
  createdAt: string
}

interface PendingPurchase {
  listingId: string
}

interface PendingResponse {
  purchases: PendingPurchase[]
  nextCursor: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRawListings(value: unknown): RawSellerListing[] {
  if (!isRecord(value) || !Array.isArray(value['listings'])) {
    throw new Error('Invalid listings response')
  }

  return value['listings'].map((item): RawSellerListing => {
    if (!isRecord(item)) {
      throw new Error('Invalid listing item')
    }

    const id = item['id']
    const title = item['title']
    const category = item['category']
    const priceUsdc = item['priceUsdc']
    const createdAt = item['createdAt']
    const salesCount = item['salesCount']

    if (
      typeof id !== 'string' ||
      typeof title !== 'string' ||
      typeof category !== 'string' ||
      typeof priceUsdc !== 'string' ||
      typeof createdAt !== 'string'
    ) {
      throw new Error('Listing response is missing required fields')
    }

    return {
      id,
      title,
      category,
      priceUsdc,
      salesCount: typeof salesCount === 'number' ? salesCount : 0,
      createdAt,
    }
  })
}

function parseOnchainId(value: unknown): number | null {
  if (!isRecord(value)) {
    return null
  }

  const listing = value['listing']
  if (!isRecord(listing)) {
    return null
  }

  const onchainId = listing['onchainId']
  return typeof onchainId === 'number' && Number.isFinite(onchainId)
    ? onchainId
    : null
}

function parsePendingResponse(value: unknown): PendingResponse {
  if (!isRecord(value) || !Array.isArray(value['purchases'])) {
    throw new Error('Invalid pending deliveries response')
  }

  const purchases = value['purchases'].map((item): PendingPurchase => {
    if (!isRecord(item)) {
      throw new Error('Invalid pending purchase item')
    }

    const listing = item['listing']
    if (!isRecord(listing) || typeof listing['id'] !== 'string') {
      throw new Error('Pending purchase listing payload is invalid')
    }

    return { listingId: listing['id'] }
  })

  const rawCursor = value['nextCursor']
  const nextCursor =
    typeof rawCursor === 'string' && rawCursor ? rawCursor : null

  return { purchases, nextCursor }
}

async function readApiError(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (isRecord(payload) && typeof payload['error'] === 'string') {
      return payload['error']
    }
  } catch {
    // ignore parse errors and use fallback
  }

  return fallback
}

async function fetchListingOnchainId(
  listingId: string
): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/listings/${listingId}`, {
      cache: 'no-store',
    })

    if (!res.ok) {
      return null
    }

    const payload: unknown = await res.json()
    return parseOnchainId(payload)
  } catch (error) {
    console.error(`Failed to fetch onchainId for listing ${listingId}:`, error)
    return null
  }
}

function formatPrice(value: string): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return parsed.toFixed(2)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function parseBalanceAmount(value: unknown): bigint {
  if (Array.isArray(value) && typeof value[0] === 'bigint') {
    return value[0]
  }

  if (isRecord(value) && typeof value['amount'] === 'bigint') {
    return value['amount']
  }

  return 0n
}

function formatUsdcAmount(value: bigint): string {
  const raw = formatUnits(value, 6)
  return raw.includes('.') ? raw.replace(/\.?0+$/, '') : raw
}

interface BalanceSummaryProps {
  onchainId: number | null
  onWithdrawSuccess?: () => void
}

function ListingBalanceSummary({
  onchainId,
  onWithdrawSuccess,
}: BalanceSummaryProps) {
  const hasContractAddress =
    MARKETPLACE_ADDRESS.toLowerCase() !== ZERO_ADDRESS.toLowerCase()

  const { data, isLoading, isError } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_READ_ABI,
    functionName: 'getListingBalance',
    args: [BigInt(onchainId ?? 0)],
    query: {
      enabled: onchainId !== null && hasContractAddress,
      refetchInterval: 30_000,
    },
  })

  const amount = useMemo(() => parseBalanceAmount(data), [data])
  const hasBalance = amount > 0n

  if (onchainId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Balance: unavailable (missing on-chain id).
      </p>
    )
  }

  if (!hasContractAddress) {
    return (
      <p className="text-sm text-muted-foreground">
        Balance: unavailable (missing marketplace contract address).
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Balance:{' '}
        {isLoading
          ? 'Loading...'
          : isError
            ? 'Unable to read balance'
            : `${formatUsdcAmount(amount)} USDC`}
      </p>

      {hasBalance && (
        <WithdrawalButton
          listingId={onchainId}
          onWithdrawSuccess={onWithdrawSuccess}
        />
      )}
    </div>
  )
}

export default function SellDashboardPage() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listings, setListings] = useState<SellerListing[]>([])
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchPendingCounts = useCallback(async (): Promise<
    Record<string, number>
  > => {
    if (!address || !isConnected) {
      return {}
    }

    const authHeader = await buildAuthHeader(
      address,
      signMessageAsync,
      'general'
    )
    const counts: Record<string, number> = {}
    let cursor: string | null = null

    do {
      const query = new URLSearchParams()
      query.set('limit', '50')
      if (cursor) {
        query.set('cursor', cursor)
      }

      const res = await fetch(
        `${API_URL}/api/purchases/pending-deliveries?${query.toString()}`,
        { headers: { Authorization: authHeader }, cache: 'no-store' }
      )

      if (!res.ok) {
        throw new Error(
          await readApiError(res, 'Failed to load pending deliveries.')
        )
      }

      const payload: unknown = await res.json()
      const parsed = parsePendingResponse(payload)

      for (const purchase of parsed.purchases) {
        counts[purchase.listingId] = (counts[purchase.listingId] ?? 0) + 1
      }

      cursor = parsed.nextCursor
    } while (cursor)

    return counts
  }, [address, isConnected, signMessageAsync])

  const fetchDashboard = useCallback(async () => {
    if (!address || !isConnected) {
      setListings([])
      setPendingCounts({})
      return
    }

    setLoading(true)
    setError(null)

    try {
      const listingsRes = await fetch(
        `${API_URL}/api/listings?seller=${address.toLowerCase()}`,
        { cache: 'no-store' }
      )

      if (!listingsRes.ok) {
        throw new Error(
          await readApiError(listingsRes, 'Failed to load your listings.')
        )
      }

      const listingsPayload: unknown = await listingsRes.json()
      const rawListings = parseRawListings(listingsPayload)

      const listingsWithOnchainId = await Promise.all(
        rawListings.map(async (listing): Promise<SellerListing> => {
          const onchainId = await fetchListingOnchainId(listing.id)
          return { ...listing, onchainId }
        })
      )

      setListings(listingsWithOnchainId)

      if (listingsWithOnchainId.length === 0) {
        setPendingCounts({})
        return
      }

      try {
        const counts = await fetchPendingCounts()
        setPendingCounts(counts)
      } catch (pendingError) {
        console.error('Pending delivery count fetch failed:', pendingError)
        setPendingCounts({})
        setError(
          pendingError instanceof Error
            ? pendingError.message
            : 'Unable to load pending deliveries.'
        )
      }
    } catch (dashboardError) {
      console.error('Failed to fetch seller dashboard:', dashboardError)
      setListings([])
      setPendingCounts({})
      setError(
        dashboardError instanceof Error
          ? dashboardError.message
          : 'Unable to load seller dashboard.'
      )
    } finally {
      setLoading(false)
    }
  }, [address, fetchPendingCounts, isConnected])

  useEffect(() => {
    if (mounted && isConnected) {
      void fetchDashboard()
    }
  }, [fetchDashboard, isConnected, mounted])

  if (!mounted) {
    return null
  }

  if (!isConnected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <Wallet className="w-10 h-10 text-brand-500 mb-4" />
        <h2 className="text-xl font-semibold text-foreground">
          Connect your wallet
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Connect the seller wallet to manage deliveries and earnings.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Listings</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Manage key delivery and withdraw listing earnings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchDashboard()}
              disabled={loading}
              className="btn-outline inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>

            <Link
              href="/sell/new"
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Create New Listing
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {loading && listings.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        )}

        {!loading && listings.length === 0 && (
          <div className="card text-center py-14">
            <BadgeDollarSign className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              No listings yet
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first listing to start selling datasets.
            </p>
            <div className="mt-6">
              <Link href="/sell/new" className="btn-primary px-5 py-2 text-sm">
                Create New Listing
              </Link>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {listings.map((listing) => {
            const pending = pendingCounts[listing.id] ?? 0

            return (
              <section key={listing.id} className="card p-6 space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-500 mb-2">
                      {listing.category}
                    </div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {listing.title}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Listed on {formatDate(listing.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 md:items-end">
                    <span className="text-sm font-medium text-foreground">
                      {formatPrice(listing.priceUsdc)} USDC
                    </span>

                    {pending > 0 ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
                        <Clock className="w-3.5 h-3.5" />
                        {pending} pending key deliver
                        {pending === 1 ? 'y' : 'ies'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        No pending deliveries
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground uppercase font-medium">
                      Sales
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {listing.salesCount}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">
                      Earnings
                    </p>
                    <ListingBalanceSummary
                      onchainId={listing.onchainId}
                      onWithdrawSuccess={() => {
                        void fetchDashboard()
                      }}
                    />
                  </div>
                </div>

                {pending > 0 && (
                  <KeyDeliveryPanel
                    listingId={listing.id}
                    onDeliveryComplete={() => {
                      void fetchDashboard()
                    }}
                  />
                )}
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}
