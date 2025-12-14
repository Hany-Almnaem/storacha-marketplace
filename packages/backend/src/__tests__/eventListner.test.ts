import { decodeEventLog } from 'viem'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockedFunction } from 'vitest'

import { publicClient } from '../config/chain.js'
import prismaDB from '../config/db.js'
import {
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
    watchContractEvent: vi.fn(),
    getBlockNumber: vi.fn(),
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
      create: vi.fn(),
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

const mockWatch = publicClient.watchContractEvent as MockedFunction<
  typeof publicClient.watchContractEvent
>

const mockGetBlockNumber = publicClient.getBlockNumber as MockedFunction<
  typeof publicClient.getBlockNumber
>

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (stopPurchaseListener) stopPurchaseListener()
})

async function setupListener() {
  let onLogs: any
  mockWatch.mockImplementationOnce(({ onLogs: cb }: any) => {
    onLogs = cb
    return vi.fn() // unwatch
  })
  ;(prismaDB.eventLog.findFirst as any).mockResolvedValue(null)
  mockGetBlockNumber.mockResolvedValue(200n)

  await startPurchaseListener()
  expect(typeof stopPurchaseListener).toBe('function')

  return onLogs
}

describe('eventListener.ts – coverage', () => {
  it('processes valid PurchaseCompleted event', async () => {
    const onLogs = await setupListener()

    ;(prismaDB.eventLog.findUnique as any).mockResolvedValue(null)
    txListingFind.mockResolvedValue({ id: 'listing-id' })
    ;(decodeEventLog as any).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 1n,
        buyer: '0xbuyer',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    })

    await onLogs([
      {
        blockNumber: 190n,
        transactionHash: '0xtx',
        logIndex: 0,
        address: '0xmarketplace',
        data: '0x',
        topics: [],
      },
    ])

    expect(txPurchaseUpsert).toHaveBeenCalledTimes(1)
    expect(txEventLogCreate).toHaveBeenCalledTimes(1)
  })
  it('starts listener from last processed block', async () => {
    mockWatch.mockImplementationOnce(() => vi.fn())
    ;(prismaDB.eventLog.findFirst as any).mockResolvedValue({
      blockNumber: 123,
    })

    mockGetBlockNumber.mockResolvedValue(999n)

    await startPurchaseListener()

    expect(publicClient.watchContractEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 123n,
      })
    )
  })
  it('skips logs with null critical fields', async () => {
    const onLogs = await setupListener()

    await onLogs([
      {
        blockNumber: null,
        transactionHash: null,
        logIndex: null,
      },
    ])

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })
  it('skips logs from unconfirmed blocks', async () => {
    const onLogs = await setupListener()

    mockGetBlockNumber.mockResolvedValueOnce(200n)

    await onLogs([
      {
        blockNumber: 199n, // > confirmedBlock (200 - 5 = 195)
        transactionHash: '0xtx',
        logIndex: 0,
      },
    ])

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })
})
