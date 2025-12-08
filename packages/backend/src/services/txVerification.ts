import { decodeEventLog, type Log } from 'viem'

import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
} from '../config/chain.js'

/**
 * Result of a verified purchase transaction
 */
export interface VerifiedPurchase {
  listingId: number
  buyer: string
  seller: string
  amountUsdc: bigint
  blockNumber: number
}

/**
 * Custom error for transaction verification failures
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

export enum TxVerificationErrorCode {
  TX_NOT_FOUND = 'TX_NOT_FOUND',
  TX_FAILED = 'TX_FAILED',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  LISTING_MISMATCH = 'LISTING_MISMATCH',
  BUYER_MISMATCH = 'BUYER_MISMATCH',
  WRONG_CONTRACT = 'WRONG_CONTRACT',
}

/**
 * Verify a purchase transaction on-chain.
 *
 * This function MUST be called before trusting any client-submitted purchase data.
 * It fetches the transaction receipt and verifies:
 * 1. Transaction succeeded (status === 'success')
 * 2. PurchaseCompleted event was emitted by our contract
 * 3. Event args match expected listingId and buyer
 *
 * @param txHash - Transaction hash to verify
 * @param expectedListingId - Expected listing ID from client
 * @param expectedBuyer - Expected buyer address from client
 * @returns Verified purchase data from on-chain event
 * @throws TxVerificationError if verification fails
 */
export async function verifyPurchase(
  txHash: `0x${string}`,
  expectedListingId: number,
  expectedBuyer: `0x${string}`
): Promise<VerifiedPurchase> {
  // 1. Fetch transaction receipt
  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch {
    throw new TxVerificationError(
      `Transaction not found: ${txHash}`,
      TxVerificationErrorCode.TX_NOT_FOUND
    )
  }

  // 2. Verify transaction succeeded
  if (receipt.status !== 'success') {
    throw new TxVerificationError(
      `Transaction failed: ${txHash}`,
      TxVerificationErrorCode.TX_FAILED
    )
  }

  // 3. Find PurchaseCompleted event from our contract
  const purchaseEvent = findPurchaseCompletedEvent(receipt.logs)

  if (!purchaseEvent) {
    throw new TxVerificationError(
      `PurchaseCompleted event not found in transaction: ${txHash}`,
      TxVerificationErrorCode.EVENT_NOT_FOUND
    )
  }

  const { listingId, buyer, seller, amountUsdc } = purchaseEvent

  // 4. Verify listingId matches
  if (Number(listingId) !== expectedListingId) {
    throw new TxVerificationError(
      `Listing ID mismatch: expected ${expectedListingId}, got ${listingId}`,
      TxVerificationErrorCode.LISTING_MISMATCH
    )
  }

  // 5. Verify buyer matches (case-insensitive comparison)
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
 * Parse logs to find a PurchaseCompleted event from our contract
 */
function findPurchaseCompletedEvent(logs: Log[]): {
  listingId: bigint
  buyer: string
  seller: string
  amountUsdc: bigint
} | null {
  for (const log of logs) {
    // Skip logs from other contracts
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
      // Not a valid event from our contract, continue
      continue
    }
  }

  return null
}

/**
 * Verify multiple purchases in parallel
 * Returns array of results, with errors for failed verifications
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
  const results = await Promise.all(
    purchases.map(async ({ txHash, expectedListingId, expectedBuyer }) => {
      try {
        const data = await verifyPurchase(
          txHash,
          expectedListingId,
          expectedBuyer
        )
        return { success: true as const, data }
      } catch (error) {
        if (error instanceof TxVerificationError) {
          return { success: false as const, error }
        }
        return {
          success: false as const,
          error: new TxVerificationError(
            `Unknown error: ${error instanceof Error ? error.message : String(error)}`,
            TxVerificationErrorCode.TX_NOT_FOUND
          ),
        }
      }
    })
  )
  return results
}
