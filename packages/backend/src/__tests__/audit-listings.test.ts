import { describe, it, expect, vi } from 'vitest'

const mockReadContract = vi.fn()
const mockFindMany = vi.fn()
const mockWarn = vi.fn()

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

vi.mock('@/lib/logger', () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: mockWarn,
      error: vi.fn(),
    }),
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

    await import('../scripts/audit-listings')

    expect(mockWarn).toHaveBeenCalledWith(expect.anything(), 'PRICE_MISMATCH')
  })
})
