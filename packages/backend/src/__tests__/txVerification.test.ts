import { encodeEventTopics, encodeAbiParameters } from 'viem'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Contract address used in tests
const MOCK_CONTRACT_ADDRESS = '0xce383BfDF637772a9C56EEa033B7Eb9129A19999'

// Mock the chain module
const mockGetTransactionReceipt = vi.fn()

vi.mock('../config/chain.js', async () => {
  const actual = await vi.importActual('../config/chain.js')
  return {
    ...actual,
    MARKETPLACE_ADDRESS: MOCK_CONTRACT_ADDRESS,
    publicClient: {
      getTransactionReceipt: mockGetTransactionReceipt,
    },
  }
})

// PurchaseCompleted event ABI for encoding test data
const purchaseCompletedEvent = {
  type: 'event',
  name: 'PurchaseCompleted',
  inputs: [
    { indexed: true, name: 'listingId', type: 'uint256' },
    { indexed: true, name: 'buyer', type: 'address' },
    { indexed: true, name: 'seller', type: 'address' },
    { indexed: false, name: 'amountUsdc', type: 'uint256' },
  ],
} as const

/**
 * Helper to create a mock PurchaseCompleted log
 */
function createPurchaseCompletedLog(
  listingId: bigint,
  buyer: `0x${string}`,
  seller: `0x${string}`,
  amountUsdc: bigint,
  contractAddress: `0x${string}` = MOCK_CONTRACT_ADDRESS as `0x${string}`
) {
  const topics = encodeEventTopics({
    abi: [purchaseCompletedEvent],
    eventName: 'PurchaseCompleted',
    args: { listingId, buyer, seller },
  })

  const data = encodeAbiParameters(
    [{ name: 'amountUsdc', type: 'uint256' }],
    [amountUsdc]
  )

  return {
    address: contractAddress,
    topics,
    data,
    blockNumber: BigInt(12345),
    blockHash: ('0x' + '0'.repeat(64)) as `0x${string}`,
    transactionHash: ('0x' + '1'.repeat(64)) as `0x${string}`,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  }
}

describe('Transaction Verification Service', () => {
  const validTxHash =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`
  const validBuyer =
    '0x1111111111111111111111111111111111111111' as `0x${string}`
  const validSeller =
    '0x2222222222222222222222222222222222222222' as `0x${string}`
  const validListingId = 1
  const validAmountUsdc = BigInt(10_000_000) // 10 USDC

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('verifyPurchase', () => {
    it('should return verified purchase data for valid transaction', async () => {
      const log = createPurchaseCompletedLog(
        BigInt(validListingId),
        validBuyer,
        validSeller,
        validAmountUsdc
      )

      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [log],
      })

      const { verifyPurchase } = await import('../services/txVerification.js')
      const result = await verifyPurchase(
        validTxHash,
        validListingId,
        validBuyer
      )

      expect(result).toEqual({
        listingId: validListingId,
        buyer: validBuyer,
        seller: validSeller,
        amountUsdc: validAmountUsdc,
        blockNumber: 12345,
      })
    })

    it('should throw TX_NOT_FOUND for non-existent transaction', async () => {
      mockGetTransactionReceipt.mockRejectedValueOnce(
        new Error('Transaction not found')
      )

      const { verifyPurchase, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      await expect(
        verifyPurchase(validTxHash, validListingId, validBuyer)
      ).rejects.toMatchObject({
        code: TxVerificationErrorCode.TX_NOT_FOUND,
        message: expect.stringContaining('Transaction not found'),
      })
    })

    it('should throw TX_FAILED for failed transaction', async () => {
      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'reverted',
        blockNumber: BigInt(12345),
        logs: [],
      })

      const { verifyPurchase, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      await expect(
        verifyPurchase(validTxHash, validListingId, validBuyer)
      ).rejects.toMatchObject({
        code: TxVerificationErrorCode.TX_FAILED,
        message: expect.stringContaining('Transaction failed'),
      })
    })

    it('should throw EVENT_NOT_FOUND when no PurchaseCompleted event', async () => {
      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [], // No logs
      })

      const { verifyPurchase, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      await expect(
        verifyPurchase(validTxHash, validListingId, validBuyer)
      ).rejects.toMatchObject({
        code: TxVerificationErrorCode.EVENT_NOT_FOUND,
        message: expect.stringContaining('PurchaseCompleted event not found'),
      })
    })

    it('should throw LISTING_MISMATCH when listingId does not match', async () => {
      const wrongListingId = 999
      const log = createPurchaseCompletedLog(
        BigInt(wrongListingId),
        validBuyer,
        validSeller,
        validAmountUsdc
      )

      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [log],
      })

      const { verifyPurchase, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      await expect(
        verifyPurchase(validTxHash, validListingId, validBuyer)
      ).rejects.toMatchObject({
        code: TxVerificationErrorCode.LISTING_MISMATCH,
        message: expect.stringContaining(
          `expected ${validListingId}, got ${wrongListingId}`
        ),
      })
    })

    it('should throw BUYER_MISMATCH when buyer does not match', async () => {
      const wrongBuyer =
        '0x9999999999999999999999999999999999999999' as `0x${string}`
      const log = createPurchaseCompletedLog(
        BigInt(validListingId),
        wrongBuyer,
        validSeller,
        validAmountUsdc
      )

      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [log],
      })

      const { verifyPurchase, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      await expect(
        verifyPurchase(validTxHash, validListingId, validBuyer)
      ).rejects.toMatchObject({
        code: TxVerificationErrorCode.BUYER_MISMATCH,
        message: expect.stringContaining('Buyer mismatch'),
      })
    })

    it('should ignore events from other contracts', async () => {
      const otherContract =
        '0x3333333333333333333333333333333333333333' as `0x${string}`
      const logFromOtherContract = createPurchaseCompletedLog(
        BigInt(validListingId),
        validBuyer,
        validSeller,
        validAmountUsdc,
        otherContract
      )

      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [logFromOtherContract],
      })

      const { verifyPurchase, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      await expect(
        verifyPurchase(validTxHash, validListingId, validBuyer)
      ).rejects.toMatchObject({
        code: TxVerificationErrorCode.EVENT_NOT_FOUND,
      })
    })

    it('should handle case-insensitive buyer address comparison', async () => {
      const checksumBuyer =
        '0x1111111111111111111111111111111111111111' as `0x${string}`
      const lowercaseBuyer =
        '0x1111111111111111111111111111111111111111' as `0x${string}`

      const log = createPurchaseCompletedLog(
        BigInt(validListingId),
        checksumBuyer,
        validSeller,
        validAmountUsdc
      )

      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [log],
      })

      const { verifyPurchase } = await import('../services/txVerification.js')
      const result = await verifyPurchase(
        validTxHash,
        validListingId,
        lowercaseBuyer
      )

      expect(result.buyer.toLowerCase()).toBe(lowercaseBuyer.toLowerCase())
    })

    it('should find event among multiple logs', async () => {
      // Create some noise logs (invalid for our contract)
      const noiseLog = {
        address: '0x4444444444444444444444444444444444444444' as `0x${string}`,
        topics: ['0x' + '0'.repeat(64)] as [`0x${string}`],
        data: '0x' as `0x${string}`,
        blockNumber: BigInt(12345),
        blockHash: ('0x' + '0'.repeat(64)) as `0x${string}`,
        transactionHash: validTxHash,
        transactionIndex: 0,
        logIndex: 0,
        removed: false,
      }

      const validLog = createPurchaseCompletedLog(
        BigInt(validListingId),
        validBuyer,
        validSeller,
        validAmountUsdc
      )

      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: 'success',
        blockNumber: BigInt(12345),
        logs: [noiseLog, validLog, noiseLog],
      })

      const { verifyPurchase } = await import('../services/txVerification.js')
      const result = await verifyPurchase(
        validTxHash,
        validListingId,
        validBuyer
      )

      expect(result.listingId).toBe(validListingId)
    })
  })

  describe('verifyPurchases', () => {
    it('should verify multiple purchases in parallel', async () => {
      const log1 = createPurchaseCompletedLog(
        BigInt(1),
        validBuyer,
        validSeller,
        validAmountUsdc
      )
      const log2 = createPurchaseCompletedLog(
        BigInt(2),
        validBuyer,
        validSeller,
        validAmountUsdc
      )

      mockGetTransactionReceipt
        .mockResolvedValueOnce({
          status: 'success',
          blockNumber: BigInt(12345),
          logs: [log1],
        })
        .mockResolvedValueOnce({
          status: 'success',
          blockNumber: BigInt(12346),
          logs: [log2],
        })

      const { verifyPurchases } = await import('../services/txVerification.js')
      const results = await verifyPurchases([
        {
          txHash: ('0x' + 'a'.repeat(64)) as `0x${string}`,
          expectedListingId: 1,
          expectedBuyer: validBuyer,
        },
        {
          txHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
          expectedListingId: 2,
          expectedBuyer: validBuyer,
        },
      ])

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
      if (results[0].success) {
        expect(results[0].data.listingId).toBe(1)
      }
      if (results[1].success) {
        expect(results[1].data.listingId).toBe(2)
      }
    })

    it('should return errors for failed verifications without throwing', async () => {
      mockGetTransactionReceipt
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          status: 'reverted',
          blockNumber: BigInt(12345),
          logs: [],
        })

      const { verifyPurchases, TxVerificationErrorCode } =
        await import('../services/txVerification.js')
      const results = await verifyPurchases([
        {
          txHash: ('0x' + 'a'.repeat(64)) as `0x${string}`,
          expectedListingId: 1,
          expectedBuyer: validBuyer,
        },
        {
          txHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
          expectedListingId: 2,
          expectedBuyer: validBuyer,
        },
      ])

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(false)
      expect(results[1].success).toBe(false)

      if (!results[0].success) {
        expect(results[0].error.code).toBe(TxVerificationErrorCode.TX_NOT_FOUND)
      }
      if (!results[1].success) {
        expect(results[1].error.code).toBe(TxVerificationErrorCode.TX_FAILED)
      }
    })
  })

  describe('TxVerificationError', () => {
    it('should create error with correct name and code', async () => {
      const { TxVerificationError, TxVerificationErrorCode } =
        await import('../services/txVerification.js')

      const error = new TxVerificationError(
        'Test error',
        TxVerificationErrorCode.TX_FAILED
      )

      expect(error.name).toBe('TxVerificationError')
      expect(error.code).toBe(TxVerificationErrorCode.TX_FAILED)
      expect(error.message).toBe('Test error')
    })
  })
})
