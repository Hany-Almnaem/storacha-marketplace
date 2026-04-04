/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  publicClient,
  MARKETPLACE_ADDRESS,
  CONFIRMATIONS_REQUIRED,
} from '../config/chain.js'
import prismaDB from '../config/db.js'
import { logger as baseLogger } from '../lib/logger.js'

import { parsePurchaseCompletedEvent } from './eventParsing.js'
import { notifySeller } from './notification.js'

const logger = baseLogger.child({ service: 'listener' })

const POLL_INTERVAL_MS = 8_000
export const MAX_BLOCK_CHUNK = 2_000n
export const OVERLAP_BLOCKS = 5n
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
let lastPollTime = 0
let lastSuccessfulPollTime = 0

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
        logger.error(
          { label, attempt, maxRetries, err: message },
          `${label} failed after maximum attempts`
        )
        throw error
      }

      const delayMs = RPC_RETRY_BASE_MS * attempt
      logger.warn(
        { label, attempt, maxRetries, delayMs, err: message },
        `${label} attempt failed, retrying`
      )
      await sleep(delayMs)
    }
  }

  throw new Error('unreachable')
}

export async function recordFailedEvent(
  log: any,
  errorMessage: string
): Promise<void> {
  try {
    await prismaDB.eventLog.upsert({
      where: {
        txHash_logIndex: {
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        },
      },
      update: {
        error: errorMessage,
      },
      create: {
        eventType: 'PurchaseCompleted',
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: Number(log.blockNumber),
        processed: false,
        error: errorMessage,
        data: {
          address: log.address,
          data: log.data,
          topics: log.topics,
        },
      },
    })
  } catch (dbError) {
    logger.error(
      { err: dbError, txHash: log.transactionHash, logIndex: log.logIndex },
      'Failed to record event failure in database'
    )
  }
}

export async function processLog(log: any): Promise<'created' | 'skipped'> {
  if (log.blockNumber == null || !log.transactionHash || log.logIndex == null) {
    logger.warn({ log }, 'Skipping log with missing fields')
    return 'skipped'
  }

  const blockNumber = Number(log.blockNumber)
  const txHash: string = log.transactionHash
  const logIndex: number = log.logIndex

  const alreadyProcessed = await prismaDB.eventLog.findUnique({
    where: {
      txHash_logIndex: { txHash, logIndex },
    },
  })

  if (alreadyProcessed?.processed) {
    return 'skipped'
  }

  const { listingId, buyer, seller, amountUsdc } =
    parsePurchaseCompletedEvent(log)

  const logCtx = { listingId: listingId.toString(), blockNumber, txHash }
  logger.info(logCtx, 'Processing purchase event')

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

    await tx.eventLog.upsert({
      where: { txHash_logIndex: { txHash, logIndex } },
      update: { processed: true, error: null },
      create: {
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

  return 'created'
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
      where: { eventType: 'PurchaseCompleted' },
      orderBy: { blockNumber: 'desc' },
    })

    const rawFrom = lastEvent
      ? BigInt(lastEvent.blockNumber) - OVERLAP_BLOCKS
      : confirmedBlock - OVERLAP_BLOCKS
    const fromBlock = rawFrom > 0n ? rawFrom : 0n

    if (fromBlock > confirmedBlock) return

    let chunkStart = fromBlock

    while (chunkStart <= confirmedBlock) {
      const chunkEnd =
        chunkStart + MAX_BLOCK_CHUNK - 1n < confirmedBlock
          ? chunkStart + MAX_BLOCK_CHUNK - 1n
          : confirmedBlock

      logger.debug({ chunkStart, chunkEnd }, 'Scanning blocks')

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
        logger.info(
          { count: logs.length, chunkStart, chunkEnd },
          'Found events in block chunk'
        )
      }

      for (const log of logs) {
        try {
          await processLog(log)
          lastPollTime = Date.now()
          lastSuccessfulPollTime = Date.now()
        } catch (error) {
          logger.error(
            {
              err: error,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            },
            'Failed to process log'
          )
          await recordFailedEvent(
            log,
            error instanceof Error ? error.message : String(error)
          )
          lastPollTime = Date.now()
        }
      }

      chunkStart = chunkEnd + 1n
    }
  } finally {
    polling = false
  }
}

export function startPurchaseListener() {
  logger.info('Starting PurchaseCompleted polling listener')

  pollOnce().catch((error) => {
    logger.error({ err: error }, 'Initial poll failed')
  })

  pollingInterval = setInterval(() => {
    pollOnce().catch((error) => {
      logger.error({ err: error }, 'Poll iteration failed')
    })
  }, POLL_INTERVAL_MS)
}

export function stopPurchaseListener() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

export function getLastPollTime() {
  return lastPollTime
}

export function getLastSuccessfulPollTime() {
  return lastSuccessfulPollTime
}
