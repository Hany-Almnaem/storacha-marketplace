import { describe, it, expect, vi } from 'vitest'

const mockReadContract = vi.fn()
const mockFindMany = vi.fn()

vi.mock('@/config/chain', () => ({
  publicClient: {
    readContract: mockReadContract,
  },
  MARKETPLACE_ABI: [],
}))

vi.mock('@/config/db', () => ({
  prisma: {
    listing: {
      findMany: mockFindMany,
    },
    $disconnect: vi.fn(),
  },
}))

describe('audit script', () => {
  it('detects PRICE_MISMATCH', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: '1',
        onchainId: 1,
        sellerAddress: '0xaaa',
        dataCid: 'cid',
        envelopeCid: 'cid',
        envelopeHash: '0xhash',
        priceUsdc: '100',
      },
    ])

    mockReadContract.mockResolvedValue([
      '0xaaa',
      'cid',
      'cid',
      '0xhash',
      200n,
      true,
      0n,
    ])

    const logSpy = vi.spyOn(console, 'log')

    await import('../scripts/audit-listings')

    expect(logSpy).toHaveBeenCalledWith('PRICE_MISMATCH')
  })
})
