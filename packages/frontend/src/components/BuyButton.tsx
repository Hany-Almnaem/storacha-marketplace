'use client'

import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'

import { config } from '../config'

import { usePurchaseAccess } from '@/hooks/usePurchaseAccess'
import { useUsdcApproval } from '@/hooks/useUsdcApproval'
import { getOrCreateBuyerKeypair } from '@/lib/buyerKeys'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

const MARKETPLACE_ADDRESS = process.env[
  'NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS'
] as `0x${string}`

const USDC_ADDRESS = process.env['NEXT_PUBLIC_USDC_ADDRESS'] as `0x${string}`

type Status =
  | 'idle'
  | 'approving'
  | 'buying'
  | 'confirming'
  | 'binding'
  | 'done'
  | 'error'

interface BuyButtonProps {
  onchainId: number
  priceUsdc: string
}

export default function BuyButton({ onchainId, priceUsdc }: BuyButtonProps) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const { approveIfNeeded } = useUsdcApproval(
    USDC_ADDRESS,
    MARKETPLACE_ADDRESS,
    priceUsdc
  )

  const { purchase } = usePurchaseAccess(MARKETPLACE_ADDRESS)

  /* --------------------------------------------- */
  /* 🔄 Wait for backend to index purchase */
  /* --------------------------------------------- */

  async function waitForBackendPurchase(
    txHash: `0x${string}`
  ): Promise<{ id: string }> {
    if (!address) throw new Error('Wallet not connected')

    for (let i = 0; i < 15; i++) {
      const timestamp = Date.now().toString()
      const message = `Authenticate to Data Marketplace\nTimestamp: ${timestamp}`
      const signature = await signMessageAsync({ message })

      const authHeader = `signature ${address}:${timestamp}:${signature}`

      const res = await fetch(`${API_URL}/api/purchases`, {
        headers: { Authorization: authHeader },
      })

      if (res.ok) {
        const json = await res.json()
        const purchases = json.purchases || []

        const found = purchases.find(
          (p: any) => p.txHash?.toLowerCase() === txHash.toLowerCase()
        )

        if (found) return found
      }

      await new Promise((r) => setTimeout(r, 2000))
    }

    throw new Error('Purchase not indexed by backend yet')
  }

  /* --------------------------------------------- */
  /* 🛒 Handle Buy Flow */
  /* --------------------------------------------- */

  const handleBuy = async () => {
    if (!address) {
      setError('Please connect your wallet')
      return
    }

    try {
      setError(null)

      /* 1️⃣ Approve USDC */
      setStatus('approving')
      await approveIfNeeded()

      /* 2️⃣ Execute Purchase */
      setStatus('buying')
      const txHash = await purchase(onchainId)

      /* 3️⃣ Wait for Confirmation */
      setStatus('confirming')
      await waitForTransactionReceipt(config, {
        hash: txHash,
      })

      /* 4️⃣ Wait for backend indexing */
      const purchaseRecord = await waitForBackendPurchase(txHash)

      /* 5️⃣ Generate Buyer Keypair */
      setStatus('binding')
      const { publicKeyBase64 } = await getOrCreateBuyerKeypair(
        purchaseRecord.id
      )

      /* 6️⃣ Sign bind message (separate from auth signature) */
      const bindTimestamp = Date.now()

      const bindMessage = `I am the buyer of purchase ${purchaseRecord.id}.\nMy public key: ${publicKeyBase64}\nTimestamp: ${bindTimestamp}`

      const bindSignature = await signMessageAsync({
        message: bindMessage,
      })

      /* 7️⃣ Create auth signature */
      const authMessage = `Authenticate to Data Marketplace\nTimestamp: ${bindTimestamp}`
      const authSignature = await signMessageAsync({
        message: authMessage,
      })

      const authHeader = `signature ${address}:${bindTimestamp}:${authSignature}`

      /* 8️⃣ Bind key on backend */
      const bindRes = await fetch(
        `${API_URL}/api/purchases/${purchaseRecord.id}/bind-key`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify({
            publicKey: publicKeyBase64,
            signature: bindSignature,
            timestamp: bindTimestamp,
          }),
        }
      )

      if (!bindRes.ok) {
        throw new Error('Failed to bind public key')
      }

      setStatus('done')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Purchase failed')
      setStatus('error')
    }
  }

  /* --------------------------------------------- */
  /* 🎨 UI */
  /* --------------------------------------------- */

  const labelMap: Record<Status, string> = {
    idle: `Buy for ${priceUsdc} USDC`,
    approving: 'Approving USDC…',
    buying: 'Submitting Transaction…',
    confirming: 'Waiting for Confirmation…',
    binding: 'Securing Access…',
    done: 'Purchased ✓',
    error: 'Retry Purchase',
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleBuy}
        disabled={status !== 'idle' && status !== 'error'}
        className="w-full py-3 px-4 rounded-xl font-semibold text-white
        bg-blue-600 hover:bg-blue-700
        disabled:bg-gray-400 disabled:cursor-not-allowed
        transition-all duration-200 shadow-sm"
      >
        {labelMap[status]}
      </button>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
          {error}
        </div>
      )}
    </div>
  )
}
