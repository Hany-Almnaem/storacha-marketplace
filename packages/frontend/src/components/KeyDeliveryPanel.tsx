'use client'

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

import { buildAuthHeader } from '@/lib/authHeader'
import { encryptKeyForBuyer, parsePublicKeyFromBase64 } from '@/lib/keyDelivery'
import { getOrCreateSpace, initializeClient, uploadBlob } from '@/lib/storacha'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'
const DEFAULT_SPACE_NAME = 'storacha-marketplace'

type StorachaClient = Awaited<ReturnType<typeof initializeClient>>

type DeliveryStatus = 'idle' | 'delivering' | 'success' | 'error'

interface DeliveryState {
  status: DeliveryStatus
  message?: string
}

interface PendingDelivery {
  id: string
  buyerAddress: string
  buyerPublicKey: string
  amountUsdc: string
  createdAt: string
  listing: {
    id: string
    title: string
    onchainId: number
  }
}

interface PendingDeliveriesResponse {
  purchases: PendingDelivery[]
  nextCursor: string | null
}

export interface KeyDeliveryPanelProps {
  listingId: string
  onDeliveryComplete?: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: Record<string, unknown>, field: string): string {
  const raw = value[field]
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`Invalid "${field}" in response`)
  }

  return raw
}

function readNumber(value: Record<string, unknown>, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`Invalid "${field}" in response`)
  }

  return raw
}

function parsePendingDelivery(value: unknown): PendingDelivery {
  if (!isRecord(value)) {
    throw new Error('Invalid pending delivery item')
  }

  const listingValue = value['listing']
  if (!isRecord(listingValue)) {
    throw new Error('Invalid listing payload in pending delivery')
  }

  return {
    id: readString(value, 'id'),
    buyerAddress: readString(value, 'buyerAddress'),
    buyerPublicKey: readString(value, 'buyerPublicKey'),
    amountUsdc: readString(value, 'amountUsdc'),
    createdAt: readString(value, 'createdAt'),
    listing: {
      id: readString(listingValue, 'id'),
      title: readString(listingValue, 'title'),
      onchainId: readNumber(listingValue, 'onchainId'),
    },
  }
}

function parsePendingResponse(value: unknown): PendingDeliveriesResponse {
  if (!isRecord(value) || !Array.isArray(value['purchases'])) {
    throw new Error('Invalid pending deliveries response')
  }

  const purchases = value['purchases'].map((item) => parsePendingDelivery(item))
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
    // ignore body parse errors
  }

  return fallback
}

function parseSellerAesKeyBackup(raw: string): JsonWebKey {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid backup JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid key backup format')
  }

  if (parsed['kty'] !== 'oct' || typeof parsed['k'] !== 'string') {
    throw new Error('Backup file does not contain a valid AES JWK key')
  }

  return parsed
}

function shortAddress(address: string): string {
  if (address.length < 12) {
    return address
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

export function KeyDeliveryPanel({
  listingId,
  onDeliveryComplete,
}: KeyDeliveryPanelProps) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [email, setEmail] = useState('')
  const [sellerAesKeyJwk, setSellerAesKeyJwk] = useState<JsonWebKey | null>(
    null
  )
  const [keyFileName, setKeyFileName] = useState<string | null>(null)
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>(
    []
  )
  const [deliveryState, setDeliveryState] = useState<
    Record<string, DeliveryState>
  >({})
  const [loadingPending, setLoadingPending] = useState(false)
  const [initializingStoracha, setInitializingStoracha] = useState(false)
  const [deliveringAll, setDeliveringAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storachaClient, setStorachaClient] = useState<StorachaClient | null>(
    null
  )

  const keyReady = sellerAesKeyJwk !== null

  const pendingCount = useMemo(
    () =>
      pendingDeliveries.filter(
        (purchase) => deliveryState[purchase.id]?.status !== 'success'
      ).length,
    [deliveryState, pendingDeliveries]
  )

  const fetchPendingDeliveries = useCallback(async () => {
    if (!address || !isConnected) {
      setPendingDeliveries([])
      return
    }

    setLoadingPending(true)
    setError(null)

    try {
      const authHeader = await buildAuthHeader(
        address,
        signMessageAsync,
        'general'
      )

      const allPending: PendingDelivery[] = []
      let cursor: string | null = null

      do {
        const query = new URLSearchParams()
        query.set('limit', '50')
        if (cursor) {
          query.set('cursor', cursor)
        }

        const res = await fetch(
          `${API_URL}/api/purchases/pending-deliveries?${query.toString()}`,
          {
            headers: { Authorization: authHeader },
          }
        )

        if (!res.ok) {
          throw new Error(
            await readApiError(res, 'Failed to load pending key deliveries.')
          )
        }

        const payload: unknown = await res.json()
        const parsed = parsePendingResponse(payload)
        allPending.push(...parsed.purchases)
        cursor = parsed.nextCursor
      } while (cursor)

      const filtered = allPending.filter(
        (purchase) => purchase.listing.id === listingId
      )
      setPendingDeliveries(filtered)

      setDeliveryState((previous) => {
        const next: Record<string, DeliveryState> = {}

        for (const purchase of filtered) {
          next[purchase.id] = previous[purchase.id] ?? { status: 'idle' }
        }

        return next
      })
    } catch (fetchError) {
      console.error('Failed to fetch pending deliveries:', fetchError)
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to fetch pending deliveries.'
      )
    } finally {
      setLoadingPending(false)
    }
  }, [address, isConnected, listingId, signMessageAsync])

  useEffect(() => {
    if (isConnected && address) {
      void fetchPendingDeliveries()
    }
  }, [address, fetchPendingDeliveries, isConnected])

  const handleKeyFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    try {
      const raw = await selectedFile.text()
      const jwk = parseSellerAesKeyBackup(raw)
      setSellerAesKeyJwk(jwk)
      setKeyFileName(selectedFile.name)
      setError(null)
    } catch (fileError) {
      console.error('Failed to parse key backup:', fileError)
      setSellerAesKeyJwk(null)
      setKeyFileName(null)
      setError(
        fileError instanceof Error
          ? fileError.message
          : 'Failed to load key backup file.'
      )
    } finally {
      event.target.value = ''
    }
  }

  const ensureStorachaClient =
    useCallback(async (): Promise<StorachaClient> => {
      if (storachaClient) {
        return storachaClient
      }

      const normalizedEmail = email.trim()
      if (!normalizedEmail) {
        throw new Error('Storacha email is required to upload encrypted keys.')
      }

      setInitializingStoracha(true)

      try {
        const client = await initializeClient(normalizedEmail)
        await getOrCreateSpace(client, DEFAULT_SPACE_NAME)
        setStorachaClient(client)
        return client
      } finally {
        setInitializingStoracha(false)
      }
    }, [email, storachaClient])

  const markDeliveryState = useCallback(
    (purchaseId: string, state: DeliveryState) => {
      setDeliveryState((previous) => ({
        ...previous,
        [purchaseId]: state,
      }))
    },
    []
  )

  const submitKeyCid = useCallback(
    async (
      purchaseId: string,
      keyCid: string,
      authHeader: string
    ): Promise<void> => {
      const res = await fetch(`${API_URL}/api/purchases/${purchaseId}/key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ keyCid }),
      })

      if (!res.ok) {
        throw new Error(
          await readApiError(res, 'Failed to confirm key delivery on backend.')
        )
      }
    },
    []
  )

  const deliverForPurchase = useCallback(
    async (
      purchase: PendingDelivery,
      authHeader: string
    ): Promise<{ purchaseId: string; keyCid: string }> => {
      if (!sellerAesKeyJwk) {
        throw new Error('Load seller key backup before delivering keys.')
      }

      markDeliveryState(purchase.id, {
        status: 'delivering',
        message: 'Encrypting key and uploading...',
      })

      const buyerPublicKeyJwk = parsePublicKeyFromBase64(
        purchase.buyerPublicKey
      )
      const encryptedKey = await encryptKeyForBuyer(
        sellerAesKeyJwk,
        buyerPublicKeyJwk
      )

      const client = await ensureStorachaClient()
      const keyCid = await uploadBlob(client, encryptedKey)
      await submitKeyCid(purchase.id, keyCid, authHeader)

      markDeliveryState(purchase.id, {
        status: 'success',
        message: `Delivered (${keyCid.slice(0, 16)}...)`,
      })

      return { purchaseId: purchase.id, keyCid }
    },
    [ensureStorachaClient, markDeliveryState, sellerAesKeyJwk, submitKeyCid]
  )

  const handleDeliverSingle = async (purchase: PendingDelivery) => {
    if (!address || !isConnected) {
      setError('Connect wallet before delivering keys.')
      return
    }

    try {
      setError(null)
      const authHeader = await buildAuthHeader(
        address,
        signMessageAsync,
        'general'
      )
      await deliverForPurchase(purchase, authHeader)

      setPendingDeliveries((previous) =>
        previous.filter((item) => item.id !== purchase.id)
      )

      if (onDeliveryComplete) {
        onDeliveryComplete()
      }
    } catch (deliveryError) {
      console.error('Single key delivery failed:', deliveryError)
      markDeliveryState(purchase.id, {
        status: 'error',
        message:
          deliveryError instanceof Error
            ? deliveryError.message
            : 'Key delivery failed',
      })
      setError(
        deliveryError instanceof Error
          ? deliveryError.message
          : 'Unable to deliver key.'
      )
    }
  }

  const handleDeliverAll = async () => {
    if (!address || !isConnected) {
      setError('Connect wallet before delivering keys.')
      return
    }

    if (!pendingDeliveries.length) {
      return
    }

    setDeliveringAll(true)
    setError(null)

    try {
      const authHeader = await buildAuthHeader(
        address,
        signMessageAsync,
        'general'
      )

      const deliveredIds: string[] = []

      for (const purchase of pendingDeliveries) {
        try {
          await deliverForPurchase(purchase, authHeader)
          deliveredIds.push(purchase.id)
        } catch (deliveryError) {
          console.error(
            `Delivery failed for purchase ${purchase.id}:`,
            deliveryError
          )
          markDeliveryState(purchase.id, {
            status: 'error',
            message:
              deliveryError instanceof Error
                ? deliveryError.message
                : 'Key delivery failed',
          })
        }
      }

      if (deliveredIds.length > 0) {
        setPendingDeliveries((previous) =>
          previous.filter((purchase) => !deliveredIds.includes(purchase.id))
        )
        if (onDeliveryComplete) {
          onDeliveryComplete()
        }
      }

      if (deliveredIds.length !== pendingDeliveries.length) {
        setError('Some deliveries failed. Review item-level errors and retry.')
      }
    } catch (deliverAllError) {
      console.error('Bulk key delivery failed:', deliverAllError)
      setError(
        deliverAllError instanceof Error
          ? deliverAllError.message
          : 'Unable to deliver all keys.'
      )
    } finally {
      setDeliveringAll(false)
    }
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-brand-500" />
            Key Delivery
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Pending buyers for this listing: {pendingCount}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchPendingDeliveries()}
            disabled={loadingPending || deliveringAll}
            className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>

          <button
            type="button"
            onClick={handleDeliverAll}
            disabled={
              deliveringAll ||
              loadingPending ||
              pendingDeliveries.length === 0 ||
              !keyReady ||
              !email.trim() ||
              initializingStoracha
            }
            className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deliveringAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Deliver All
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Storacha Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            disabled={deliveringAll || initializingStoracha}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Seller AES Backup Key</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void handleKeyFileChange(event)
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium"
            disabled={deliveringAll}
          />
        </label>
      </div>

      {(keyFileName || initializingStoracha) && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          {initializingStoracha ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Initializing Storacha session...
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              Loaded key backup: {keyFileName}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {!loadingPending && pendingDeliveries.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-3 py-4 text-sm text-muted-foreground">
          No pending deliveries for this listing.
        </div>
      )}

      {pendingDeliveries.length > 0 && (
        <div className="space-y-3">
          {pendingDeliveries.map((purchase) => {
            const state = deliveryState[purchase.id] ?? { status: 'idle' }
            const isDelivering =
              state.status === 'delivering' ||
              (deliveringAll && state.status === 'idle')

            return (
              <div
                key={purchase.id}
                className="rounded-lg border border-border bg-card px-3 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Buyer {shortAddress(purchase.buyerAddress)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Purchase {purchase.amountUsdc} USDC •{' '}
                    {formatTimestamp(purchase.createdAt)}
                  </p>
                  {state.message && (
                    <p
                      className={`text-xs ${
                        state.status === 'error'
                          ? 'text-red-600'
                          : state.status === 'success'
                            ? 'text-green-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {state.message}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleDeliverSingle(purchase)}
                  disabled={
                    deliveringAll ||
                    isDelivering ||
                    state.status === 'success' ||
                    !keyReady ||
                    !email.trim() ||
                    initializingStoracha
                  }
                  className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs self-start md:self-auto disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isDelivering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Delivering...
                    </>
                  ) : state.status === 'success' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Delivered
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Deliver Key
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
