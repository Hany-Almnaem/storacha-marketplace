/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEventLog } from 'viem'

import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  CONFIRMATIONS_REQUIRED,
} from '../config/chain.js'
import prismaDB from '../config/db.js'

import { notifySeller } from './notification.js'

const POLL_INTERVAL_MS = 8_000
export const MAX_BLOCK_CHUNK = 2_000n
const MAX_RPC_RETRIES = 3
const RPC_RETRY_BASE_MS = 1_000

export const PURCHASE_COMPLETED_EVENT = {
  type: 'event' as const,
  name: 'PurchaseCompleted' as const,
  inputs: [
    { indexed: true, name: 'listingId', type: 'uint256' as const },
    { indexed: true, name: 'buyer', type: 'address' as const },
    { indexed: true, name: 'seller', type: 'address' as const },
    { indexed: false, name: 'amountUsdc', type: 'uint256' as const },
  ],
}

let pollingInterval: NodeJS.Timeout | null = null
let polling = false

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = MAX_RPC_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (attempt === maxRetries) {
        console.error(
          `[listener] ${label} failed after ${maxRetries} attempts: ${message}`
        )
        throw error
      }

      const delayMs = RPC_RETRY_BASE_MS * attempt
      console.warn(
        `[listener] ${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms: ${message}`
      )
      await sleep(delayMs)
    }
  }

  throw new Error('unreachable')
}

export async function processLog(log: any): Promise<void> {
  if (log.blockNumber == null || !log.transactionHash || log.logIndex == null) {
    console.warn('[listener] Skipping log with missing fields')
    return
  }

  const blockNumber = Number(log.blockNumber)
  const txHash: string = log.transactionHash
  const logIndex: number = log.logIndex

  const alreadyProcessed = await prismaDB.eventLog.findUnique({
    where: {
      txHash_logIndex: { txHash, logIndex },
    },
  })

  if (alreadyProcessed) {
    return
  }

  const decoded = decodeEventLog({
    abi: MARKETPLACE_ABI,
    data: log.data,
    topics: log.topics,
  })

  const { listingId, buyer, seller, amountUsdc } = decoded.args as any

  console.log(
    `[listener] Processing purchase: listing=${listingId}, block=${blockNumber}, tx=${txHash}`
  )

  const purchase = await prismaDB.$transaction(async (tx: any) => {
    const listing = await tx.listing.findUnique({
      where: { onchainId: Number(listingId) },
    })

    if (!listing) throw new Error('LISTING_NOT_FOUND')

    const created = await tx.purchase.upsert({
      where: { txHash },
      update: {},
      create: {
        listingId: listing.id,
        buyerAddress: buyer,
        txHash,
        amountUsdc: amountUsdc.toString(),
        txVerified: true,
        blockNumber,
      },
    })

    await tx.eventLog.create({
      data: {
        eventType: 'PurchaseCompleted',
        txHash,
        logIndex,
        blockNumber,
        processed: true,
      },
    })

    return created
  })

  await notifySeller({
    seller,
    purchaseId: purchase.id,
  })
}

export async function pollOnce(): Promise<void> {
  if (polling) return
  polling = true

  try {
    const latestBlock = await withRetry(
      () => publicClient.getBlockNumber(),
      'getBlockNumber'
    )
    const confirmedBlock = latestBlock - BigInt(CONFIRMATIONS_REQUIRED)

    const lastEvent = await prismaDB.eventLog.findFirst({
      orderBy: { blockNumber: 'desc' },
    })

    // Overlap: re-scan from lastEvent.blockNumber (not +1n) so that
    // partially processed blocks are retried. The dedup check in
    // processLog safely skips already-processed events.
    const fromBlock = lastEvent
      ? BigInt(lastEvent.blockNumber)
      : confirmedBlock - 5n

    if (fromBlock > confirmedBlock) return

    let chunkStart = fromBlock

    while (chunkStart <= confirmedBlock) {
      const chunkEnd =
        chunkStart + MAX_BLOCK_CHUNK - 1n < confirmedBlock
          ? chunkStart + MAX_BLOCK_CHUNK - 1n
          : confirmedBlock

      console.log(`[listener] Scanning blocks ${chunkStart} → ${chunkEnd}`)

      const logs = await withRetry(
        () =>
          publicClient.getLogs({
            address: MARKETPLACE_ADDRESS,
            event: PURCHASE_COMPLETED_EVENT,
            fromBlock: chunkStart,
            toBlock: chunkEnd,
          }),
        `getLogs(${chunkStart}-${chunkEnd})`
      )

      if (logs.length) {
        console.log(
          `[listener] Found ${logs.length} PurchaseCompleted events in chunk`
        )
      }

      for (const log of logs) {
        await processLog(log)
      }

      chunkStart = chunkEnd + 1n
    }
  } finally {
    polling = false
  }
}

export function startPurchaseListener() {
  console.log('[listener] Starting PurchaseCompleted polling listener')

  pollOnce().catch((error) => {
    console.error('[listener] Initial poll failed:', error)
  })

  pollingInterval = setInterval(() => {
    pollOnce().catch((error) => {
      console.error('[listener] Poll error:', error)
    })
  }, POLL_INTERVAL_MS)
}

export function stopPurchaseListener() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}
