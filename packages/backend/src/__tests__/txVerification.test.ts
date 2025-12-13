import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'

// ---- PARTIAL MOCK viem (keep http, createPublicClient, etc.)
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    decodeEventLog: vi.fn(),
  }
})

// ---- MOCK chain config
vi.mock('../config/chain.js', () => ({
  publicClient: {
    getTransactionReceipt: vi.fn(),
    getBlockNumber: vi.fn(),
  },
  MARKETPLACE_ADDRESS: '0xmarketplace',
  MARKETPLACE_ABI: [],
  CONFIRMATIONS_REQUIRED: 5,
}))

import { decodeEventLog } from 'viem'
import {
  verifyPurchase,
  TxVerificationErrorCode,
} from '../services/txVerification.js'
import { publicClient } from '../config/chain.js'

// ---- CAST MOCKED FUNCTIONS (IMPORTANT)
const mockGetReceipt =
  publicClient.getTransactionReceipt as MockedFunction<
    typeof publicClient.getTransactionReceipt
  >

const mockGetBlockNumber =
  publicClient.getBlockNumber as MockedFunction<
    typeof publicClient.getBlockNumber
  >

const baseReceipt = {
  status: 'success',
  blockNumber: 100n,
  logs: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('txVerification.ts', () => {
  it('verifies purchase successfully', async () => {
    mockGetReceipt.mockResolvedValueOnce({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    mockGetBlockNumber.mockResolvedValueOnce(200n)

    ;(decodeEventLog as any).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 1n,
        buyer: '0xbuyer',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    })

    const result = await verifyPurchase(
      '0xtx' as any,
      1,
      '0xbuyer' as any
    )

    expect(result.listingId).toBe(1)
    expect(result.buyer).toBe('0xbuyer')
    expect(result.amountUsdc).toBe(10n)
  })

  it('throws TX_NOT_FOUND', async () => {
    mockGetReceipt.mockRejectedValueOnce(new Error())

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.TX_NOT_FOUND,
    })
  })

  it('throws TX_FAILED', async () => {
    mockGetReceipt.mockResolvedValueOnce({
      ...baseReceipt,
      status: 'reverted',
    } as any)

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.TX_FAILED,
    })
  })

  it('throws TX_NOT_CONFIRMED', async () => {
    mockGetReceipt.mockResolvedValueOnce(baseReceipt as any)
    mockGetBlockNumber.mockResolvedValueOnce(102n)

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.TX_NOT_CONFIRMED,
    })
  })

  it('throws WRONG_CONTRACT', async () => {
    mockGetReceipt.mockResolvedValueOnce({
      ...baseReceipt,
      logs: [{ address: '0xother' }],
    } as any)

    mockGetBlockNumber.mockResolvedValueOnce(200n)

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.WRONG_CONTRACT,
    })
  })

  it('throws LISTING_MISMATCH', async () => {
    mockGetReceipt.mockResolvedValueOnce({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    mockGetBlockNumber.mockResolvedValueOnce(200n)

    ;(decodeEventLog as any).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 2n,
        buyer: '0xbuyer',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    })

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.LISTING_MISMATCH,
    })
  })

  it('throws BUYER_MISMATCH', async () => {
    mockGetReceipt.mockResolvedValueOnce({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    mockGetBlockNumber.mockResolvedValueOnce(200n)

    ;(decodeEventLog as any).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 1n,
        buyer: '0xother',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    })

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.BUYER_MISMATCH,
    })
  })

  it('throws EVENT_NOT_FOUND', async () => {
    mockGetReceipt.mockResolvedValueOnce({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    mockGetBlockNumber.mockResolvedValueOnce(200n)

    ;(decodeEventLog as any).mockReturnValue({
      eventName: 'OtherEvent',
      args: {},
    })

    await expect(
      verifyPurchase('0xtx' as any, 1, '0xbuyer' as any)
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.EVENT_NOT_FOUND,
    })
  })
})
