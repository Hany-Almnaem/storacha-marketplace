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

const txPurchaseUpsert = vi.fn()
const txEventLogCreate = vi.fn()
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
  CONFIRMATIONS_REQUIRED: 5,
}))

vi.mock('../config/db.js', () => ({
  default: {
    eventLog: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn: any) =>
      fn({
        listing: { findUnique: txListingFind },
        purchase: { upsert: txPurchaseUpsert },
        eventLog: { create: txEventLogCreate },
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
  txListingFind.mockResolvedValue({ id: 'listing-id' })
  txPurchaseUpsert.mockResolvedValue({ id: 'purchase-id' })
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
    expect(txEventLogCreate).toHaveBeenCalledTimes(1)
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
    })

    await pollOnce()

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('uses overlap scanning from last processed block', async () => {
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 150,
    })

    await pollOnce()

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 150n,
      })
    )
  })

  it('skips poll when caught up (fromBlock > confirmedBlock)', async () => {
    mockGetBlockNumber.mockResolvedValue(155n)
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 151,
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
      expect.objectContaining({ fromBlock: 1000n, toBlock: 2999n })
    )
    expect(mockGetLogs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fromBlock: 3000n, toBlock: 4999n })
    )
    expect(mockGetLogs).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ fromBlock: 5000n, toBlock: 5195n })
    )
  })

  it('retries transient RPC errors', async () => {
    mockGetBlockNumber
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(200n)

    await pollOnce()

    expect(mockGetBlockNumber).toHaveBeenCalledTimes(2)
  }, 10_000)

  it('stops processing on event failure to protect cursor', async () => {
    const log1 = makeMockLog({ transactionHash: '0xtx1', logIndex: 0 })
    const log2 = makeMockLog({ transactionHash: '0xtx2', logIndex: 1 })
    mockGetLogs.mockResolvedValue([log1, log2])
    txListingFind.mockRejectedValueOnce(new Error('LISTING_NOT_FOUND'))

    await expect(pollOnce()).rejects.toThrow('LISTING_NOT_FOUND')

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('falls back to recent blocks when no prior events exist', async () => {
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue(null)
    mockGetBlockNumber.mockResolvedValue(200n)

    await pollOnce()

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 190n,
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
    expect(txEventLogCreate).not.toHaveBeenCalled()
  })

  it('starts and stops listener cleanly', () => {
    startPurchaseListener()
    expect(typeof stopPurchaseListener).toBe('function')
    stopPurchaseListener()
  })
})
