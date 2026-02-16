'use client'

import { AlertCircle, CheckCircle2, Clock, Loader2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'

import { config } from '@/config'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

const MARKETPLACE_ADDRESS =
  (process.env['NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS'] as `0x${string}`) ||
  ZERO_ADDRESS

const MARKETPLACE_ABI = [
  {
    name: 'getWithdrawableTime',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_listingId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
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
  {
    name: 'withdrawEarnings',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_listingId', type: 'uint256' }],
    outputs: [],
  },
] as const

interface ListingBalance {
  amount: bigint
  firstPurchaseTime: bigint
}

export interface WithdrawalButtonProps {
  listingId: number
  onWithdrawSuccess?: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseListingBalance(value: unknown): ListingBalance {
  if (Array.isArray(value)) {
    const amount = value[0]
    const firstPurchaseTime = value[1]
    if (typeof amount === 'bigint' && typeof firstPurchaseTime === 'bigint') {
      return { amount, firstPurchaseTime }
    }
  }

  if (isRecord(value)) {
    const amount = value['amount']
    const firstPurchaseTime = value['firstPurchaseTime']
    if (typeof amount === 'bigint' && typeof firstPurchaseTime === 'bigint') {
      return { amount, firstPurchaseTime }
    }
  }

  return { amount: 0n, firstPurchaseTime: 0n }
}

function parseWithdrawableTime(value: unknown): bigint {
  return typeof value === 'bigint' ? value : 0n
}

function formatUsdc(amount: bigint): string {
  const raw = formatUnits(amount, 6)
  if (!raw.includes('.')) {
    return raw
  }

  return raw.replace(/\.?0+$/, '')
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`
  }

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function parseErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error['shortMessage'] === 'string') {
    return error['shortMessage']
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Withdrawal failed. Please try again.'
}

export function WithdrawalButton({
  listingId,
  onWithdrawSuccess,
}: WithdrawalButtonProps) {
  const { isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const normalizedListingId = useMemo(() => {
    if (!Number.isInteger(listingId) || listingId < 0) {
      return null
    }
    return BigInt(listingId)
  }, [listingId])

  const hasConfiguredAddress =
    MARKETPLACE_ADDRESS.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
  const canRead = normalizedListingId !== null && hasConfiguredAddress

  const {
    data: listingBalanceRaw,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getListingBalance',
    args: [normalizedListingId ?? 0n],
    query: {
      enabled: canRead,
      refetchInterval: 30_000,
    },
  })

  const {
    data: withdrawableTimeRaw,
    isLoading: isLoadingWithdrawableTime,
    refetch: refetchWithdrawableTime,
  } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getWithdrawableTime',
    args: [normalizedListingId ?? 0n],
    query: {
      enabled: canRead,
      refetchInterval: 30_000,
    },
  })

  const listingBalance = useMemo(
    () => parseListingBalance(listingBalanceRaw),
    [listingBalanceRaw]
  )

  const withdrawableTimestamp = useMemo(
    () => parseWithdrawableTime(withdrawableTimeRaw),
    [withdrawableTimeRaw]
  )

  const hasBalance = listingBalance.amount > 0n
  const withdrawableAtMs = Number(withdrawableTimestamp) * 1000
  const remainingMs =
    hasBalance && withdrawableAtMs > nowMs ? withdrawableAtMs - nowMs : 0
  const isDelayMet = hasBalance && remainingMs === 0

  useEffect(() => {
    if (!hasBalance || isDelayMet) {
      return
    }

    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [hasBalance, isDelayMet])

  const buttonDisabled =
    !isConnected ||
    !canRead ||
    !hasBalance ||
    !isDelayMet ||
    submitting ||
    confirming ||
    isLoadingBalance ||
    isLoadingWithdrawableTime

  const handleWithdraw = async () => {
    if (!isConnected) {
      setError('Connect your wallet to withdraw earnings.')
      return
    }

    if (!hasConfiguredAddress) {
      setError('Marketplace contract address is not configured.')
      return
    }

    if (normalizedListingId === null) {
      setError('Invalid listing id for withdrawal.')
      return
    }

    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'withdrawEarnings',
        args: [normalizedListingId],
      })

      setSubmitting(false)
      setConfirming(true)

      await waitForTransactionReceipt(config, { hash })

      setSuccess('Withdrawal complete.')

      await Promise.all([refetchBalance(), refetchWithdrawableTime()])

      if (onWithdrawSuccess) {
        onWithdrawSuccess()
      }
    } catch (withdrawError) {
      console.error('Withdrawal failed:', withdrawError)
      setError(parseErrorMessage(withdrawError))
    } finally {
      setSubmitting(false)
      setConfirming(false)
    }
  }

  const buttonLabel = confirming
    ? 'Confirming...'
    : submitting
      ? 'Submitting...'
      : hasBalance
        ? `Withdraw ${formatUsdc(listingBalance.amount)} USDC`
        : 'No Balance'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleWithdraw}
        disabled={buttonDisabled}
        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting || confirming ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Wallet className="w-4 h-4" />
        )}
        {buttonLabel}
      </button>

      {hasBalance && !isDelayMet && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Withdrawable in {formatCountdown(remainingMs)}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  )
}
