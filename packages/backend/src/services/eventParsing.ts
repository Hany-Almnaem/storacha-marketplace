/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEventLog } from 'viem'

import { MARKETPLACE_ABI } from '../config/chain.js'

export interface ParsedPurchaseCompletedEvent {
  listingId: string
  buyer: string
  seller: string
  amountUsdc: string
}

export function parsePurchaseCompletedEvent(log: {
  data: unknown
  topics: unknown
}): ParsedPurchaseCompletedEvent {
  const decoded = decodeEventLog({
    abi: MARKETPLACE_ABI,
    data: log.data as any,
    topics: log.topics as any,
  })

  const { listingId, buyer, seller, amountUsdc } = decoded.args as any

  return {
    listingId: listingId.toString(),
    buyer: buyer as string,
    seller: seller as string,
    amountUsdc: amountUsdc.toString(),
  }
}
