
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
  WRONG_CONTRACT = 'WRONG_CONTRACT',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  LISTING_MISMATCH = 'LISTING_MISMATCH',
  BUYER_MISMATCH = 'BUYER_MISMATCH',
}