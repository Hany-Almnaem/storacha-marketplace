'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'

import { usePurchaseAccess } from '@/hooks/usePurchaseAccess'
import { useUsdcApproval } from '@/hooks/useUsdcApproval'

const MARKETPLACE_ADDRESS = process.env[
  'NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS'
] as `0x${string}`

const USDC_ADDRESS = process.env['NEXT_PUBLIC_USDC_ADDRESS'] as `0x${string}`

type Status = 'idle' | 'approving' | 'buying' | 'done' | 'error'

interface BuyButtonProps {
  listingId: string
  priceUsdc: string
}

export default function BuyButton({ listingId, priceUsdc }: BuyButtonProps) {
  const { address } = useAccount()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const { approveIfNeeded } = useUsdcApproval(
    USDC_ADDRESS,
    MARKETPLACE_ADDRESS,
    priceUsdc
  )

  const { purchase } = usePurchaseAccess(MARKETPLACE_ADDRESS)

  const handleBuy = async () => {
    if (!address) {
      setError('Please connect your wallet')
      return
    }

    try {
      setError(null)

      setStatus('approving')
      await approveIfNeeded()

      setStatus('buying')
      await purchase(Number(listingId))

      setStatus('done')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Purchase failed')
      setStatus('error')
    }
  }

  return (
    <div>
      <button
        onClick={handleBuy}
        disabled={status !== 'idle'}
        className={`w-full py-3 px-4 rounded-md font-bold text-white transition-colors ${
          status !== 'idle'
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {status === 'idle' && `Buy for ${priceUsdc} USDC`}
        {status === 'approving' && 'Approving USDC…'}
        {status === 'buying' && 'Confirming Purchase…'}
        {status === 'done' && 'Purchased ✓'}
        {status === 'error' && 'Retry Purchase'}
      </button>

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
    </div>
  )
}
