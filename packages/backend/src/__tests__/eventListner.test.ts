import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'

// --------------------------------------------------
// Shared tx mocks
// --------------------------------------------------
const txPurchaseUpsert = vi.fn()
const txEventLogCreate = vi.fn()
const txListingFind = vi.fn()

// --------------------------------------------------
// Partial viem mock (KEEP http)
// --------------------------------------------------
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    decodeEventLog: vi.fn(),
  }
})

// --------------------------------------------------
// Mock chain
// --------------------------------------------------
vi.mock('../config/chain.js', () => ({
  publicClient: {
    watchContractEvent: vi.fn(),
    getBlockNumber: vi.fn(),
  },
  MARKETPLACE_ADDRESS: '0xmarketplace',
  MARKETPLACE_ABI: [],
  CONFIRMATIONS_REQUIRED: 5,
}))

// --------------------------------------------------
// Mock prisma (transaction-aware)
// --------------------------------------------------
vi.mock('../config/db.js', () => ({
  default: {
    eventLog: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: any) =>
      fn({
        listing: {
          findUnique: txListingFind,
        },
        purchase: {
          upsert: txPurchaseUpsert,
        },
        eventLog: {
          create: txEventLogCreate,
        },
      })
    ),
  },
}))

// --------------------------------------------------
// Mock notification
// --------------------------------------------------
vi.mock('../services/notification.js', () => ({
  notifySeller: vi.fn(),
}))

import { decodeEventLog } from 'viem'
import prisma from '../config/db.js'
import { publicClient } from '../config/chain.js'
import { startPurchaseListener } from '../services/eventListener.js'

// --------------------------------------------------
// Cast mocks
// --------------------------------------------------
const mockWatch =
  publicClient.watchContractEvent as MockedFunction<
    typeof publicClient.watchContractEvent
  >

const mockGetBlockNumber =
  publicClient.getBlockNumber as MockedFunction<
    typeof publicClient.getBlockNumber
  >

beforeEach(() => {
  vi.clearAllMocks()
})

async function setupListener() {
  let onLogs: any
  mockWatch.mockImplementationOnce(({ onLogs: cb }: any) => {
    onLogs = cb
  })

  ;(prisma.eventLog.findFirst as any).mockResolvedValue(null)
  mockGetBlockNumber.mockResolvedValue(200n)

  await startPurchaseListener()
  return onLogs
}

describe('eventListener.ts – branch coverage', () => {
  it('skips log with null fields', async () => {
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

  it('skips unconfirmed block', async () => {
    const onLogs = await setupListener()

    await onLogs([
      {
        blockNumber: 198n, // < confirmed
        transactionHash: '0xtx',
        logIndex: 0,
      },
    ])

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('skips already processed event', async () => {
    const onLogs = await setupListener()

    ;(prisma.eventLog.findUnique as any).mockResolvedValue({ id: 'exists' })

    await onLogs([
      {
        blockNumber: 190n,
        transactionHash: '0xtx',
        logIndex: 0,
      },
    ])

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('skips when decodeEventLog throws', async () => {
    const onLogs = await setupListener()

    ;(prisma.eventLog.findUnique as any).mockResolvedValue(null)
    ;(decodeEventLog as any).mockImplementation(() => {
      throw new Error('bad log')
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

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('skips non PurchaseCompleted events', async () => {
    const onLogs = await setupListener()

    ;(prisma.eventLog.findUnique as any).mockResolvedValue(null)
    ;(decodeEventLog as any).mockReturnValue({
      eventName: 'OtherEvent',
      args: {},
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

    expect(txPurchaseUpsert).not.toHaveBeenCalled()
  })

  it('handles LISTING_NOT_FOUND and writes failed eventLog', async () => {
    const onLogs = await setupListener()

    ;(prisma.eventLog.findUnique as any).mockResolvedValue(null)
    txListingFind.mockResolvedValue(null)

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

    expect(prisma.eventLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processed: false,
        }),
      })
    )
  })

  it('processes valid PurchaseCompleted event (happy path)', async () => {
    const onLogs = await setupListener()

    ;(prisma.eventLog.findUnique as any).mockResolvedValue(null)
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
})
