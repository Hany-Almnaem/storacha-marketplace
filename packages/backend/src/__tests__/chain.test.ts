import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock viem before importing chain module
const mockGetBlockNumber = vi.fn()
const mockGetChainId = vi.fn()

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem')
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBlockNumber: mockGetBlockNumber,
      getChainId: mockGetChainId,
    })),
    getContract: vi.fn(() => ({
      address: '0xce383BfDF637772a9C56EEa033B7Eb9129A19999',
      abi: [],
    })),
    http: vi.fn(() => ({})),
  }
})

describe('Chain Configuration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('exports', () => {
    it('should export MARKETPLACE_ABI', async () => {
      const { MARKETPLACE_ABI } = await import('../config/chain.js')

      expect(MARKETPLACE_ABI).toBeDefined()
      expect(Array.isArray(MARKETPLACE_ABI)).toBe(true)
      expect(MARKETPLACE_ABI.length).toBeGreaterThan(0)
    })

    it('should export MARKETPLACE_ADDRESS as valid address', async () => {
      const { MARKETPLACE_ADDRESS } = await import('../config/chain.js')

      expect(MARKETPLACE_ADDRESS).toBeDefined()
      expect(MARKETPLACE_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('should export publicClient', async () => {
      const { publicClient } = await import('../config/chain.js')

      expect(publicClient).toBeDefined()
    })

    it('should export marketplaceContract', async () => {
      const { marketplaceContract } = await import('../config/chain.js')

      expect(marketplaceContract).toBeDefined()
    })
  })

  describe('ABI structure', () => {
    it('should include ListingCreated event', async () => {
      const { MARKETPLACE_ABI } = await import('../config/chain.js')

      const event = MARKETPLACE_ABI.find(
        (item: { type?: string; name?: string }) =>
          item.type === 'event' && item.name === 'ListingCreated'
      )

      expect(event).toBeDefined()
      expect(event).toHaveProperty('inputs')
    })

    it('should include PurchaseCompleted event', async () => {
      const { MARKETPLACE_ABI } = await import('../config/chain.js')

      const event = MARKETPLACE_ABI.find(
        (item: { type?: string; name?: string }) =>
          item.type === 'event' && item.name === 'PurchaseCompleted'
      )

      expect(event).toBeDefined()
      expect(event).toHaveProperty('inputs')
    })

    it('should include Withdrawal event', async () => {
      const { MARKETPLACE_ABI } = await import('../config/chain.js')

      const event = MARKETPLACE_ABI.find(
        (item: { type?: string; name?: string }) =>
          item.type === 'event' && item.name === 'Withdrawal'
      )

      expect(event).toBeDefined()
      expect(event).toHaveProperty('inputs')
    })

    it('should include getListing function', async () => {
      const { MARKETPLACE_ABI } = await import('../config/chain.js')

      const func = MARKETPLACE_ABI.find(
        (item: { type?: string; name?: string }) =>
          item.type === 'function' && item.name === 'getListing'
      )

      expect(func).toBeDefined()
    })
  })

  describe('checkChainHealth', () => {
    it('should return block number when RPC is healthy', async () => {
      mockGetBlockNumber.mockResolvedValueOnce(BigInt(12345678))

      const { checkChainHealth } = await import('../config/chain.js')
      const result = await checkChainHealth()

      expect(result).toBe(12345678)
    })

    it('should return null when RPC fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGetBlockNumber.mockRejectedValueOnce(new Error('RPC error'))

      const { checkChainHealth } = await import('../config/chain.js')
      const result = await checkChainHealth()

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        'Chain health check failed:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })
  })

  describe('getChainId', () => {
    it('should return chain ID', async () => {
      mockGetChainId.mockResolvedValueOnce(84532) // Base Sepolia chain ID

      const { getChainId } = await import('../config/chain.js')
      const chainId = await getChainId()

      expect(chainId).toBe(84532)
    })
  })
})
