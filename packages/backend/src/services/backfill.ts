/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEventLog } from 'viem'

import {
  publicClient,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
} from '../config/chain.js'
import prismaDB from '../config/db.js'

import {
  MAX_BLOCK_CHUNK,
  PURCHASE_COMPLETED_EVENT,
  processLog,
  withRetry,
} from './eventListener.js'

export interface BackfillOptions {
  fromBlock: bigint
  toBlock: bigint
  dryRun?: boolean
}

export interface BackfillEventDetail {
  txHash: string
  logIndex: number
  blockNumber: number
  listingId: string
  buyer: string
  amountUsdc: string
  status: 'created' | 'skipped' | 'error'
  error?: string
}

export interface BackfillResult {
  fromBlock: bigint
  toBlock: bigint
  dryRun: boolean
  blocksScanned: number
  eventsFound: number
  eventsCreated: number
  eventsSkipped: number
  eventsFailed: number
  events: BackfillEventDetail[]
}

async function inspectLog(log: any): Promise<{
  txHash: string
  logIndex: number
  blockNumber: number
  alreadyProcessed: boolean
  listingId: string
  buyer: string
  amountUsdc: string
}> {
  const txHash: string = log.transactionHash
  const logIndex: number = log.logIndex
  const blockNumber = Number(log.blockNumber)

  const existing = await prismaDB.eventLog.findUnique({
    where: { txHash_logIndex: { txHash, logIndex } },
  })

  const decoded = decodeEventLog({
    abi: MARKETPLACE_ABI,
    data: log.data,
    topics: log.topics,
  })

  const { listingId, buyer, amountUsdc } = decoded.args as any

  return {
    txHash,
    logIndex,
    blockNumber,
    alreadyProcessed: !!existing,
    listingId: listingId.toString(),
    buyer: buyer as string,
    amountUsdc: amountUsdc.toString(),
  }
}

export async function backfillRange(
  options: BackfillOptions
): Promise<BackfillResult> {
  const { fromBlock, toBlock, dryRun = false } = options

  if (fromBlock > toBlock) {
    throw new Error(
      `Invalid range: fromBlock (${fromBlock}) > toBlock (${toBlock})`
    )
  }

  const result: BackfillResult = {
    fromBlock,
    toBlock,
    dryRun,
    blocksScanned: 0,
    eventsFound: 0,
    eventsCreated: 0,
    eventsSkipped: 0,
    eventsFailed: 0,
    events: [],
  }

  let chunkStart = fromBlock

  while (chunkStart <= toBlock) {
    const chunkEnd =
      chunkStart + MAX_BLOCK_CHUNK - 1n < toBlock
        ? chunkStart + MAX_BLOCK_CHUNK - 1n
        : toBlock

    console.log(`[backfill] Scanning blocks ${chunkStart} → ${chunkEnd}`)

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

    result.blocksScanned += Number(chunkEnd - chunkStart + 1n)

    if (logs.length) {
      console.log(
        `[backfill] Found ${logs.length} PurchaseCompleted events in chunk`
      )
    }

    result.eventsFound += logs.length

    for (const log of logs) {
      if (
        log.blockNumber == null ||
        !log.transactionHash ||
        log.logIndex == null
      ) {
        console.warn('[backfill] Skipping log with missing fields')
        continue
      }

      if (dryRun) {
        const info = await inspectLog(log)
        const detail: BackfillEventDetail = {
          txHash: info.txHash,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          listingId: info.listingId,
          buyer: info.buyer,
          amountUsdc: info.amountUsdc,
          status: info.alreadyProcessed ? 'skipped' : 'created',
        }

        if (info.alreadyProcessed) {
          result.eventsSkipped++
          console.log(
            `[backfill] [dry-run] SKIP (already indexed): tx=${info.txHash} logIndex=${info.logIndex}`
          )
        } else {
          result.eventsCreated++
          console.log(
            `[backfill] [dry-run] WOULD CREATE: listing=${info.listingId} buyer=${info.buyer} amount=${info.amountUsdc} tx=${info.txHash}`
          )
        }

        result.events.push(detail)
      } else {
        const txHash: string = log.transactionHash
        const logIndex: number = log.logIndex

        try {
          await processLog(log)

          const info = await inspectLog(log)
          result.eventsCreated++
          result.events.push({
            txHash,
            logIndex,
            blockNumber: Number(log.blockNumber),
            listingId: info.listingId,
            buyer: info.buyer,
            amountUsdc: info.amountUsdc,
            status: 'created',
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          result.eventsFailed++
          result.events.push({
            txHash,
            logIndex,
            blockNumber: Number(log.blockNumber),
            listingId: 'unknown',
            buyer: 'unknown',
            amountUsdc: 'unknown',
            status: 'error',
            error: message,
          })
          console.error(
            `[backfill] Failed to process tx=${txHash} logIndex=${logIndex}: ${message}`
          )
        }
      }
    }

    chunkStart = chunkEnd + 1n
  }

  return result
}
