import { decodeEventLog, type Log } from 'viem'

import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  CONFIRMATIONS_REQUIRED,
} from '../config/chain.js'
import type { VerifiedPurchase } from '../types/txVerification.js'
import { TxVerificationErrorCode } from '../types/txVerification.js'

/**
 * Custom verification error
 */
export class TxVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: TxVerificationErrorCode
  ) {
    super(message)
    this.name = 'TxVerificationError'
  }
}

export async function verifyPurchase(
  txHash: `0x${string}`,
  expectedListingId: number,
  expectedBuyer: `0x${string}`
): Promise<VerifiedPurchase> {
  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch {
    throw new TxVerificationError(
      `Transaction not found: ${txHash}`,
      TxVerificationErrorCode.TX_NOT_FOUND
    )
  }

  if (receipt.status !== 'success') {
    throw new TxVerificationError(
      `Transaction failed: ${txHash}`,
      TxVerificationErrorCode.TX_FAILED
    )
  }

  const latestBlock = await publicClient.getBlockNumber()
  if (latestBlock - receipt.blockNumber < BigInt(CONFIRMATIONS_REQUIRED)) {
    throw new TxVerificationError(
      `Transaction not confirmed: ${txHash}`,
      TxVerificationErrorCode.TX_NOT_CONFIRMED
    )
  }

  const hasMarketplaceLog = receipt.logs.some(
    (l) => l.address.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()
  )

  if (!hasMarketplaceLog) {
    throw new TxVerificationError(
      `Wrong contract: ${txHash}`,
      TxVerificationErrorCode.WRONG_CONTRACT
    )
  }

  const event = findPurchaseCompletedEvent(receipt.logs)
  if (!event) {
    throw new TxVerificationError(
      `PurchaseCompleted event not found in tx ${txHash}`,
      TxVerificationErrorCode.EVENT_NOT_FOUND
    )
  }

  const { listingId, buyer, seller, amountUsdc } = event

  if (Number(listingId) !== expectedListingId) {
    throw new TxVerificationError(
      `Listing mismatch: expected ${expectedListingId}, got ${listingId}`,
      TxVerificationErrorCode.LISTING_MISMATCH
    )
  }

  if (buyer.toLowerCase() !== expectedBuyer.toLowerCase()) {
    throw new TxVerificationError(
      `Buyer mismatch: expected ${expectedBuyer}, got ${buyer}`,
      TxVerificationErrorCode.BUYER_MISMATCH
    )
  }

  return {
    listingId: Number(listingId),
    buyer,
    seller,
    amountUsdc,
    blockNumber: Number(receipt.blockNumber),
  }
}

/**
 * Extract PurchaseCompleted event from logs
 */
function findPurchaseCompletedEvent(logs: Log[]): {
  listingId: bigint
  buyer: string
  seller: string
  amountUsdc: bigint
} | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) {
      continue
    }

    try {
      const decoded = decodeEventLog({
        abi: MARKETPLACE_ABI,
        data: log.data,
        topics: log.topics,
      })

      if (decoded.eventName === 'PurchaseCompleted' && decoded.args) {
        const args = decoded.args as unknown as {
          listingId: bigint
          buyer: `0x${string}`
          seller: `0x${string}`
          amountUsdc: bigint
        }

        return {
          listingId: args.listingId,
          buyer: args.buyer,
          seller: args.seller,
          amountUsdc: args.amountUsdc,
        }
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Verify multiple purchases in parallel (Issue #4 compatibility)
 */
export async function verifyPurchases(
  purchases: Array<{
    txHash: `0x${string}`
    expectedListingId: number
    expectedBuyer: `0x${string}`
  }>
): Promise<
  Array<
    | { success: true; data: VerifiedPurchase }
    | { success: false; error: TxVerificationError }
  >
> {
  return Promise.all(
    purchases.map(async (p) => {
      try {
        const data = await verifyPurchase(
          p.txHash,
          p.expectedListingId,
          p.expectedBuyer
        )
        return { success: true as const, data }
      } catch (error) {
        if (error instanceof TxVerificationError) {
          return { success: false as const, error }
        }

        return {
          success: false as const,
          error: new TxVerificationError(
            `Unknown error: ${String(error)}`,
            TxVerificationErrorCode.TX_NOT_FOUND
          ),
        }
      }
    })
  )
}
