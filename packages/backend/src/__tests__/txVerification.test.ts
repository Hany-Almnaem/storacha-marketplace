import { decodeEventLog } from 'viem'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { publicClient } from '../config/chain.js'
import { verifyPurchase, verifyPurchases } from '../services/txVerification.js'
import * as mod from '../services/txVerification.js'
import { TxVerificationErrorCode } from '../types/txVerification.js'

// --------------------
// Mocks
// --------------------
vi.mock('../config/chain.js', () => ({
  publicClient: {
    getTransactionReceipt: vi.fn(),
    getBlockNumber: vi.fn(),
  },
  MARKETPLACE_ADDRESS: '0xmarketplace',
  MARKETPLACE_ABI: [],
  CONFIRMATIONS_REQUIRED: 5,
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    decodeEventLog: vi.fn(),
  }
})

// --------------------
// Base receipt
// --------------------
const baseReceipt = {
  status: 'success',
  blockNumber: 100n,
  logs: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====================
// verifyPurchase
// ====================
describe('verifyPurchase', () => {
  it('verifies valid purchase', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 1n,
        buyer: '0xbuyer',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    } as any)

    const result = await verifyPurchase('0xtx', 1, '0xbuyer')
    expect(result.listingId).toBe(1)
  })

  it('throws TX_NOT_FOUND', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockRejectedValue(new Error())

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.TX_NOT_FOUND
    )
  })

  it('throws TX_FAILED', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      status: 'reverted',
    } as any)

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.TX_FAILED
    )
  })

  it('throws TX_NOT_CONFIRMED', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      baseReceipt as any
    )
    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(101n)

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.TX_NOT_CONFIRMED
    )
  })

  it('throws WRONG_CONTRACT when no marketplace logs exist', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      logs: [],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.WRONG_CONTRACT
    )
  })

  it('throws EVENT_NOT_FOUND when marketplace log exists but no PurchaseCompleted', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockReturnValue({
      eventName: 'OtherEvent',
      args: {},
    } as any)

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.EVENT_NOT_FOUND
    )
  })

  it('throws LISTING_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 2n,
        buyer: '0xbuyer',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    } as any)

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.LISTING_MISMATCH
    )
  })

  it('throws BUYER_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 1n,
        buyer: '0xother',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    } as any)

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.BUYER_MISMATCH
    )
  })

  it('handles decodeEventLog throw and continues', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...baseReceipt,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockImplementation(() => {
      throw new Error('bad log')
    })

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.EVENT_NOT_FOUND
    )
  })
})

// ====================
// verifyPurchases
// ====================
describe('verifyPurchases', () => {
  it('returns mixed success and failure results', async () => {
    vi.spyOn(publicClient, 'getTransactionReceipt')
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce({
        ...baseReceipt,
        logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
      } as any)

    vi.spyOn(publicClient, 'getBlockNumber').mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockReturnValue({
      eventName: 'PurchaseCompleted',
      args: {
        listingId: 1n,
        buyer: '0xbuyer',
        seller: '0xseller',
        amountUsdc: 10n,
      },
    } as any)

    const results = await verifyPurchases([
      { txHash: '0x1', expectedListingId: 1, expectedBuyer: '0xbuyer' },
      { txHash: '0x2', expectedListingId: 1, expectedBuyer: '0xbuyer' },
    ])

    expect(results[0].success).toBe(false)
    expect(results[1].success).toBe(true)
  })

  it('handles decodeEventLog throwing and returns EVENT_NOT_FOUND', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [{ address: '0xmarketplace', data: '0x', topics: [] }],
    } as any)

    vi.mocked(publicClient.getBlockNumber).mockResolvedValue(200n)

    vi.mocked(decodeEventLog).mockImplementation(() => {
      throw new Error('bad log')
    })

    await expect(verifyPurchase('0xtx', 1, '0xbuyer')).rejects.toHaveProperty(
      'code',
      TxVerificationErrorCode.EVENT_NOT_FOUND
    )
  })

  it('verifyPurchases wraps unknown errors', async () => {
    vi.spyOn(mod, 'verifyPurchase').mockRejectedValueOnce('boom')

    const result = await mod.verifyPurchases([
      {
        txHash: '0xtx',
        expectedListingId: 1,
        expectedBuyer: '0xbuyer',
      },
    ])

    expect(result[0].success).toBe(false)
    expect(result[0].error.code).toBe(TxVerificationErrorCode.EVENT_NOT_FOUND)
  })
})
