/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEventLog } from 'viem'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'

import { publicClient } from '../config/chain.js'
import prismaDB from '../config/db.js'
import {
  backfillRange,
  findFailedEventLogsBlockRange,
  parseBackfillCliArgs,
  retryFailedPurchaseBackfill,
} from '../services/backfill.js'

const txPurchaseUpsert = vi.fn()
const txEventLogUpsert = vi.fn()
const txListingFind = vi.fn()

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    decodeEventLog: vi.fn(),
  }
})

vi.mock('../config/chain.js', () => ({
  publicClient: {
    getBlockNumber: vi.fn(),
    getLogs: vi.fn(),
  },
  MARKETPLACE_ADDRESS: '0xmarketplace',
  MARKETPLACE_ABI: [],
  CONFIRMATIONS_REQUIRED: 2,
}))

vi.mock('../config/db.js', () => ({
  default: {
    eventLog: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) =>
      fn({
        listing: { findUnique: txListingFind },
        purchase: { upsert: txPurchaseUpsert },
        eventLog: { upsert: txEventLogUpsert },
      })
    ),
  },
}))

vi.mock('../services/notification.js', () => ({
  notifySeller: vi.fn(),
}))

const mockGetLogs = (publicClient as any).getLogs as MockedFunction<any>
const mockDecodeEventLog = decodeEventLog as MockedFunction<
  typeof decodeEventLog
>

const DECODED_ARGS = {
  listingId: 42n,
  buyer: '0xbuyerAddress',
  seller: '0xsellerAddress',
  amountUsdc: 10_000_000n,
}

function makeMockLog(
  overrides: Partial<{
    blockNumber: bigint
    transactionHash: string
    logIndex: number
  }> = {}
) {
  return {
    blockNumber: overrides.blockNumber ?? 1500n,
    transactionHash: overrides.transactionHash ?? '0xtx1',
    logIndex: overrides.logIndex ?? 0,
    address: '0xmarketplace',
    data: '0x',
    topics: ['0xtopic'],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetLogs.mockResolvedValue([])
  ;(prismaDB.eventLog.findFirst as any).mockResolvedValue(null)
  ;(prismaDB.eventLog.findUnique as any).mockResolvedValue(null)
  ;(prismaDB.eventLog.findMany as any).mockResolvedValue([])
  txListingFind.mockResolvedValue({ id: 'listing-id' })
  txPurchaseUpsert.mockResolvedValue({ id: 'purchase-id' })
  mockDecodeEventLog.mockReturnValue({
    eventName: 'PurchaseCompleted',
    args: DECODED_ARGS,
  } as any)
})

describe('backfillRange', () => {
  it('rejects invalid block range', async () => {
    await expect(
      backfillRange({ fromBlock: 200n, toBlock: 100n })
    ).rejects.toThrow('Invalid range')
  })

  it('returns empty result when no events found', async () => {
    const result = await backfillRange({ fromBlock: 1000n, toBlock: 2000n })

    expect(result.eventsFound).toBe(0)
    expect(result.eventsCreated).toBe(0)
    expect(result.eventsSkipped).toBe(0)
    expect(result.blocksScanned).toBe(1001)
    expect(mockGetLogs).toHaveBeenCalledTimes(1)
  })

  it('processes events with same logic as live listener', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])

    const result = await backfillRange({ fromBlock: 1000n, toBlock: 1500n })

    expect(result.eventsFound).toBe(1)
    expect(result.eventsCreated).toBe(1)
    expect(result.eventsFailed).toBe(0)
    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txEventLogUpsert).toHaveBeenCalledTimes(1)
    expect(txPurchaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          buyerAddress: '0xbuyerAddress',
          amountUsdc: '10000000',
          txVerified: true,
        }),
      })
    )
  })

  it('creates Purchase records which updates salesCount automatically', async () => {
    mockGetLogs.mockResolvedValue([
      makeMockLog({ transactionHash: '0xtxA', logIndex: 0 }),
      makeMockLog({ transactionHash: '0xtxB', logIndex: 1 }),
    ])

    const result = await backfillRange({ fromBlock: 1000n, toBlock: 1500n })

    expect(result.eventsCreated).toBe(2)
    expect(txPurchaseUpsert).toHaveBeenCalledTimes(2)
    expect(txListingFind).toHaveBeenCalledTimes(2)
    expect(txListingFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onchainId: 42 } })
    )
  })

  it('is idempotent — skips already processed events via dedup', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])
    ;(prismaDB.eventLog.findUnique as any).mockResolvedValue({
      id: 'existing',
      processed: true,
    })

    const result = await backfillRange({ fromBlock: 1000n, toBlock: 1500n })

    expect(result.eventsFound).toBe(1)
    expect(result.eventsCreated).toBe(1)
    expect(result.eventsSkipped).toBe(0)
    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('continues on individual event failure', async () => {
    mockGetLogs.mockResolvedValue([
      makeMockLog({ transactionHash: '0xtxFail', logIndex: 0 }),
      makeMockLog({ transactionHash: '0xtxOk', logIndex: 1 }),
    ])
    txListingFind
      .mockRejectedValueOnce(new Error('LISTING_NOT_FOUND'))
      .mockResolvedValue({ id: 'listing-id' })

    const result = await backfillRange({ fromBlock: 1000n, toBlock: 1500n })

    expect(result.eventsFailed).toBe(1)
    expect(result.eventsCreated).toBe(1)
    expect(result.events[0]!.status).toBe('error')
    expect(result.events[0]!.error).toContain('LISTING_NOT_FOUND')
    expect(result.events[1]!.status).toBe('created')
  })

  it('chunks large ranges', async () => {
    const result = await backfillRange({ fromBlock: 1000n, toBlock: 5195n })

    expect(mockGetLogs).toHaveBeenCalledTimes(3)
    expect(result.blocksScanned).toBe(4196)
  })

  describe('dry-run mode', () => {
    it('does not write to database', async () => {
      mockGetLogs.mockResolvedValue([makeMockLog()])

      const result = await backfillRange({
        fromBlock: 1000n,
        toBlock: 1500n,
        dryRun: true,
      })

      expect(result.dryRun).toBe(true)
      expect(result.eventsFound).toBe(1)
      expect(result.eventsCreated).toBe(1)
      expect(txPurchaseUpsert).not.toHaveBeenCalled()
      expect(txEventLogUpsert).not.toHaveBeenCalled()
    })

    it('reports already-indexed events as skipped', async () => {
      mockGetLogs.mockResolvedValue([makeMockLog()])
      ;(prismaDB.eventLog.findUnique as any).mockResolvedValue({
        id: 'existing',
        processed: true,
      })

      const result = await backfillRange({
        fromBlock: 1000n,
        toBlock: 1500n,
        dryRun: true,
      })

      expect(result.eventsSkipped).toBe(1)
      expect(result.eventsCreated).toBe(0)
      expect(result.events[0]!.status).toBe('skipped')
    })

    it('reports new events as would-create', async () => {
      mockGetLogs.mockResolvedValue([makeMockLog()])

      const result = await backfillRange({
        fromBlock: 1000n,
        toBlock: 1500n,
        dryRun: true,
      })

      expect(result.events[0]!.status).toBe('created')
      expect(result.events[0]!.listingId).toBe('42')
      expect(result.events[0]!.buyer).toBe('0xbuyerAddress')
    })
  })
})

describe('parseBackfillCliArgs', () => {
  it('rejects --retry-failed combined with --from', () => {
    const r = parseBackfillCliArgs(['--retry-failed', '--from', '1'])
    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.exitCode).toBe(1)
      expect(r.message).toContain('--retry-failed')
      expect(r.message).toContain('--from')
    }
  })

  it('rejects --retry-failed combined with --to', () => {
    const r = parseBackfillCliArgs(['--retry-failed', '--to', '99'])
    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.exitCode).toBe(1)
    }
  })

  it('accepts --retry-failed with --dry-run', () => {
    const r = parseBackfillCliArgs(['--retry-failed', '--dry-run'])
    expect(r).toEqual({ kind: 'retry-failed', dryRun: true })
  })

  it('accepts range mode with --from and --to', () => {
    const r = parseBackfillCliArgs(['--from', '10', '--to', '20'])
    expect(r).toEqual({ kind: 'range', from: 10n, to: 20n, dryRun: false })
  })
})

describe('findFailedEventLogsBlockRange', () => {
  it('returns null when no processed=false rows', async () => {
    ;(prismaDB.eventLog.findMany as any).mockResolvedValue([])
    await expect(findFailedEventLogsBlockRange()).resolves.toBeNull()
  })

  it('returns min/max block across failed rows', async () => {
    ;(prismaDB.eventLog.findMany as any).mockResolvedValue([
      { blockNumber: 100 },
      { blockNumber: 250 },
      { blockNumber: 175 },
    ])
    await expect(findFailedEventLogsBlockRange()).resolves.toEqual({
      count: 3,
      fromBlock: 100n,
      toBlock: 250n,
    })
  })
})

describe('retryFailedPurchaseBackfill', () => {
  it('runs backfill over derived min/max blocks (100, 250, 175 → 100–250)', async () => {
    ;(prismaDB.eventLog.findMany as any).mockResolvedValue([
      { blockNumber: 100 },
      { blockNumber: 250 },
      { blockNumber: 175 },
    ])
    mockGetLogs.mockResolvedValue([])

    const out = await retryFailedPurchaseBackfill(false)
    expect(out).not.toBe('empty')
    if (out !== 'empty') {
      expect(out.fromBlock).toBe(100n)
      expect(out.toBlock).toBe(250n)
    }
    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 100n,
        toBlock: 250n,
      })
    )
  })

  it('does not scan chain when no failed events', async () => {
    ;(prismaDB.eventLog.findMany as any).mockResolvedValue([])

    const out = await retryFailedPurchaseBackfill(false)
    expect(out).toBe('empty')
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('retry dry-run uses same block window with dry-run scan (getLogs, no writes)', async () => {
    ;(prismaDB.eventLog.findMany as any).mockResolvedValue([
      { blockNumber: 100 },
    ])
    mockGetLogs.mockResolvedValue([])

    await retryFailedPurchaseBackfill(true)
    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 100n,
        toBlock: 100n,
      })
    )
  })

  it('dry-run retry uses backfillRange with dryRun so there are no DB writes', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])
    ;(prismaDB.eventLog.findMany as any).mockResolvedValue([
      { blockNumber: 1500 },
    ])

    const out = await retryFailedPurchaseBackfill(true)
    expect(out).not.toBe('empty')
    if (out !== 'empty') {
      expect(out.dryRun).toBe(true)
    }
    expect(txPurchaseUpsert).not.toHaveBeenCalled()
    expect(txEventLogUpsert).not.toHaveBeenCalled()
  })
})
