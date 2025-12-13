import { decodeEventLog } from 'viem'
import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  CONFIRMATIONS_REQUIRED,
} from '../config/chain.js'

export interface VerifiedPurchase {
  listingId: number
  buyer: string
  seller: string
  amountUsdc: bigint
  blockNumber: number
}

export enum TxVerificationErrorCode {
  TX_NOT_FOUND = 'TX_NOT_FOUND',
  TX_FAILED = 'TX_FAILED',
  TX_NOT_CONFIRMED = 'TX_NOT_CONFIRMED',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  LISTING_MISMATCH = 'LISTING_MISMATCH',
  BUYER_MISMATCH = 'BUYER_MISMATCH',
  WRONG_CONTRACT = 'WRONG_CONTRACT',
}

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
      'Transaction not found',
      TxVerificationErrorCode.TX_NOT_FOUND
    )
  }

  if (receipt.status !== 'success') {
    throw new TxVerificationError(
      'Transaction failed',
      TxVerificationErrorCode.TX_FAILED
    )
  }

  const latestBlock = await publicClient.getBlockNumber()
  if (latestBlock - receipt.blockNumber < BigInt(CONFIRMATIONS_REQUIRED)) {
    throw new TxVerificationError(
      'Transaction not confirmed',
      TxVerificationErrorCode.TX_NOT_CONFIRMED
    )
  }

  const hasMarketplaceLog = receipt.logs.some(
    (l) => l.address.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()
  )
  if (!hasMarketplaceLog) {
    throw new TxVerificationError(
      'Wrong contract',
      TxVerificationErrorCode.WRONG_CONTRACT
    )
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) continue

    try {
      const decoded = decodeEventLog({
        abi: MARKETPLACE_ABI,
        data: log.data,
        topics: log.topics,
      })

      if (decoded.eventName !== 'PurchaseCompleted') continue

      const { listingId, buyer, seller, amountUsdc } = decoded.args as any

      if (Number(listingId) !== expectedListingId) {
        throw new TxVerificationError(
          'Listing mismatch',
          TxVerificationErrorCode.LISTING_MISMATCH
        )
      }

      if (buyer.toLowerCase() !== expectedBuyer.toLowerCase()) {
        throw new TxVerificationError(
          'Buyer mismatch',
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
    } catch (err) {
      if (err instanceof TxVerificationError) throw err
      continue
    }
  }

  throw new TxVerificationError(
    'PurchaseCompleted event not found',
    TxVerificationErrorCode.EVENT_NOT_FOUND
  )
}
