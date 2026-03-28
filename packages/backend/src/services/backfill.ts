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
    alreadyProcessed: !!existing?.processed,
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

/** Rows in EventLog with processed=false (failed or never completed). */
export async function findFailedEventLogsBlockRange(): Promise<{
  count: number
  fromBlock: bigint
  toBlock: bigint
} | null> {
  const rows = await prismaDB.eventLog.findMany({
    where: { processed: false },
    select: { blockNumber: true },
  })

  if (rows.length === 0) {
    return null
  }

  const blockNumbers = rows.map((r) => r.blockNumber)
  const minBlock = Math.min(...blockNumbers)
  const maxBlock = Math.max(...blockNumbers)

  return {
    count: rows.length,
    fromBlock: BigInt(minBlock),
    toBlock: BigInt(maxBlock),
  }
}

/**
 * Re-scan the chain for PurchaseCompleted logs in the block range covering
 * all EventLog rows with processed=false.
 */
export async function retryFailedPurchaseBackfill(
  dryRun: boolean
): Promise<BackfillResult | 'empty'> {
  const range = await findFailedEventLogsBlockRange()

  if (!range) {
    return 'empty'
  }

  console.log(
    `[backfill] Found ${range.count} failed event(s) (processed=false). Derived block range: ${range.fromBlock} → ${range.toBlock}`
  )

  return backfillRange({
    fromBlock: range.fromBlock,
    toBlock: range.toBlock,
    dryRun,
  })
}

export type ParsedBackfillCli =
  | {
      kind: 'range'
      from: bigint
      to: bigint
      dryRun: boolean
    }
  | { kind: 'retry-failed'; dryRun: boolean }
  | { kind: 'error'; message: string; exitCode: number }

/**
 * Parse argv for scripts/backfill.ts (--from/--to range vs --retry-failed).
 */
export function parseBackfillCliArgs(argv: string[]): ParsedBackfillCli {
  let from: bigint | null = null
  let to: bigint | null = null
  let dryRun = false
  let retryFailed = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--from' && argv[i + 1]) {
      from = BigInt(argv[i + 1]!)
      i++
    } else if (arg === '--to' && argv[i + 1]) {
      to = BigInt(argv[i + 1]!)
      i++
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--retry-failed') {
      retryFailed = true
    }
  }

  if (retryFailed && (from !== null || to !== null)) {
    return {
      kind: 'error',
      message:
        'Error: --retry-failed cannot be used together with --from or --to. Use one mode or the other.',
      exitCode: 1,
    }
  }

  if (retryFailed) {
    return { kind: 'retry-failed', dryRun }
  }

  if (from === null || to === null) {
    return {
      kind: 'error',
      message:
        'Usage: tsx scripts/backfill.ts --from <block> --to <block> [--dry-run]\n' +
        '   or: tsx scripts/backfill.ts --retry-failed [--dry-run]',
      exitCode: 1,
    }
  }

  return { kind: 'range', from, to, dryRun }
}
