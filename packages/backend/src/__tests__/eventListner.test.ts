/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEventLog } from 'viem'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockedFunction } from 'vitest'

import { publicClient } from '../config/chain.js'
import prismaDB from '../config/db.js'
import {
  pollOnce,
  startPurchaseListener,
  stopPurchaseListener,
} from '../services/eventListener.js'
import { notifySeller } from '../services/notification.js'

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
      upsert: vi.fn(),
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

const mockGetBlockNumber = publicClient.getBlockNumber as MockedFunction<
  typeof publicClient.getBlockNumber
>
const mockGetLogs = (publicClient as any).getLogs as MockedFunction<any>
const mockDecodeEventLog = decodeEventLog as MockedFunction<
  typeof decodeEventLog
>
const mockEventLogUpsert = (prismaDB.eventLog as any)
  .upsert as MockedFunction<any>
const mockNotifySeller = notifySeller as MockedFunction<typeof notifySeller>

const DECODED_ARGS = {
  listingId: 1n,
  buyer: '0xbuyer',
  seller: '0xseller',
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
    blockNumber: overrides.blockNumber ?? 100n,
    transactionHash: overrides.transactionHash ?? '0xtx1',
    logIndex: overrides.logIndex ?? 0,
    address: '0xmarketplace',
    data: '0x',
    topics: ['0xtopic'],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBlockNumber.mockResolvedValue(200n)
  mockGetLogs.mockResolvedValue([])
  ;(prismaDB.eventLog.findFirst as any).mockResolvedValue(null)
  ;(prismaDB.eventLog.findUnique as any).mockResolvedValue(null)
  mockEventLogUpsert.mockResolvedValue({})
  txListingFind.mockResolvedValue({ id: 'listing-id' })
  txPurchaseUpsert.mockResolvedValue({ id: 'purchase-id' })
  txEventLogUpsert.mockResolvedValue({})
  mockDecodeEventLog.mockReturnValue({
    eventName: 'PurchaseCompleted',
    args: DECODED_ARGS,
  } as any)
})

afterEach(() => {
  stopPurchaseListener()
})

describe('eventListener polling', () => {
  it('processes PurchaseCompleted events', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])

    await pollOnce()

    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txEventLogUpsert).toHaveBeenCalledTimes(1)
    expect(txPurchaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: '0xtx1' },
        create: expect.objectContaining({
          buyerAddress: '0xbuyer',
          txVerified: true,
          blockNumber: 100,
        }),
      })
    )
  })

  it('skips already processed events (dedup)', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])
    ;(prismaDB.eventLog.findUnique as any).mockResolvedValue({
      id: 'existing',
      processed: true,
    })

    await pollOnce()

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('retries previously failed events on rescan', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])
    ;(prismaDB.eventLog.findUnique as any).mockResolvedValue({
      id: 'failed-event',
      processed: false,
      error: 'LISTING_NOT_FOUND',
    })

    await pollOnce()

    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txEventLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { processed: true, error: null },
      })
    )
  })

  it('uses overlap scanning with OVERLAP_BLOCKS offset', async () => {
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 150,
    })

    await pollOnce()

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 145n,
      })
    )
  })

  it('skips poll when caught up (fromBlock > confirmedBlock)', async () => {
    mockGetBlockNumber.mockResolvedValue(155n)
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 160,
    })

    await pollOnce()

    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('chunks large block ranges', async () => {
    mockGetBlockNumber.mockResolvedValue(5200n)
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 1000,
    })

    await pollOnce()

    expect(mockGetLogs).toHaveBeenCalledTimes(3)
    expect(mockGetLogs).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fromBlock: 995n, toBlock: 2994n })
    )
    expect(mockGetLogs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fromBlock: 2995n, toBlock: 4994n })
    )
    expect(mockGetLogs).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ fromBlock: 4995n, toBlock: 5198n })
    )
  })

  it('retries transient RPC errors', async () => {
    mockGetBlockNumber
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(200n)

    await pollOnce()

    expect(mockGetBlockNumber).toHaveBeenCalledTimes(2)
  }, 10_000)

  it('continues processing after individual event failure', async () => {
    const log1 = makeMockLog({ transactionHash: '0xtx1', logIndex: 0 })
    const log2 = makeMockLog({ transactionHash: '0xtx2', logIndex: 1 })
    mockGetLogs.mockResolvedValue([log1, log2])
    txListingFind
      .mockRejectedValueOnce(new Error('LISTING_NOT_FOUND'))
      .mockResolvedValue({ id: 'listing-id' })

    await pollOnce()

    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txPurchaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: '0xtx2' },
      })
    )
  })

  it('records failed events in EventLog with error context', async () => {
    const log1 = makeMockLog({
      transactionHash: '0xtxFail',
      logIndex: 3,
      blockNumber: 42n,
    })
    mockGetLogs.mockResolvedValue([log1])
    txListingFind.mockRejectedValueOnce(new Error('LISTING_NOT_FOUND'))

    await pollOnce()

    expect(mockEventLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          txHash_logIndex: { txHash: '0xtxFail', logIndex: 3 },
        },
        create: expect.objectContaining({
          eventType: 'PurchaseCompleted',
          txHash: '0xtxFail',
          logIndex: 3,
          blockNumber: 42,
          processed: false,
          error: expect.stringContaining('LISTING_NOT_FOUND'),
        }),
        update: expect.objectContaining({
          error: expect.stringContaining('LISTING_NOT_FOUND'),
        }),
      })
    )
    expect(mockEventLogUpsert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        update: expect.objectContaining({ processed: false }),
      })
    )
  })

  it('post-commit failure (notifySeller) does not downgrade successful event', async () => {
    mockGetLogs.mockResolvedValue([makeMockLog()])
    mockNotifySeller.mockRejectedValueOnce(new Error('NOTIFICATION_FAILED'))

    await pollOnce()

    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txEventLogUpsert).toHaveBeenCalledTimes(1)
    expect(txEventLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { processed: true, error: null },
      })
    )
    expect(mockEventLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          error: expect.stringContaining('NOTIFICATION_FAILED'),
        }),
      })
    )
    expect(mockEventLogUpsert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        update: expect.objectContaining({ processed: false }),
      })
    )
  })

  it('falls back to recent blocks when no prior events exist', async () => {
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue(null)
    mockGetBlockNumber.mockResolvedValue(200n)

    await pollOnce()

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 193n,
      })
    )
  })

  it('skips logs with missing critical fields', async () => {
    mockGetLogs.mockResolvedValue([
      { blockNumber: null, transactionHash: null, logIndex: null },
    ])

    await pollOnce()

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('no-ops when no events found', async () => {
    mockGetLogs.mockResolvedValue([])

    await pollOnce()

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
    expect(txEventLogUpsert).not.toHaveBeenCalled()
  })

  it('starts and stops listener cleanly', () => {
    startPurchaseListener()
    expect(typeof stopPurchaseListener).toBe('function')
    stopPurchaseListener()
  })

  it('duplicate scans from overlap do not create duplicate purchases', async () => {
    const log = makeMockLog({ transactionHash: '0xtx1', logIndex: 0 })
    mockGetLogs.mockResolvedValue([log])

    await pollOnce()
    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    mockGetBlockNumber.mockResolvedValue(200n)
    mockGetLogs.mockResolvedValue([log])
    mockEventLogUpsert.mockResolvedValue({})
    txEventLogUpsert.mockResolvedValue({})
    mockDecodeEventLog.mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: DECODED_ARGS,
    } as any)
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue(null)
    ;(prismaDB.eventLog.findUnique as any).mockResolvedValue({
      id: 'existing',
      processed: true,
    })

    await pollOnce()

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('failure recording itself failing does not break the poll cycle', async () => {
    const log1 = makeMockLog({ transactionHash: '0xtx1', logIndex: 0 })
    const log2 = makeMockLog({ transactionHash: '0xtx2', logIndex: 1 })
    mockGetLogs.mockResolvedValue([log1, log2])
    txListingFind
      .mockRejectedValueOnce(new Error('LISTING_NOT_FOUND'))
      .mockResolvedValue({ id: 'listing-id' })
    mockEventLogUpsert.mockRejectedValueOnce(new Error('DB_DOWN'))

    await pollOnce()

    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txPurchaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: '0xtx2' },
      })
    )
  })

  it('clamps fromBlock to 0 when overlap would go negative', async () => {
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 2,
    })
    mockGetBlockNumber.mockResolvedValue(50n)

    await pollOnce()

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 0n,
      })
    )
  })

  it('filters cursor query by eventType', async () => {
    await pollOnce()

    expect(prismaDB.eventLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventType: 'PurchaseCompleted' },
      })
    )
  })
})
