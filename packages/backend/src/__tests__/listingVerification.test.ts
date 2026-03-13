import { parseEventLogs } from 'viem'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/chain', () => ({
  publicClient: {
    getTransactionReceipt: vi.fn(),
    getTransactionConfirmations: vi.fn(),
  },
  MARKETPLACE_ABI: [],
  MARKETPLACE_ADDRESS: '0xmarketplace',
}))

vi.mock('viem', () => ({
  parseEventLogs: vi.fn(),
}))

import { publicClient } from '../config/chain'
import { verifyListingCreation } from '../services/listingVerification'
import { ListingVerificationError } from '../types/listingVerification'

const VALID_INPUT = {
  txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  dataCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  envelopeCid: 'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq',
  envelopeHash:
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  priceUsdc: '10000000',
}

const mockReceipt = {
  status: 'success',
  blockNumber: 100n,
  logs: [{}],
}

const validArgs = {
  listingId: 1n,
  seller: '0x1111111111111111111111111111111111111111',
  dataCid: VALID_INPUT.dataCid,
  envelopeCid: VALID_INPUT.envelopeCid,
  envelopeHash: VALID_INPUT.envelopeHash,
  priceUsdc: 10000000n,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('verifyListingCreation', () => {
  it('throws TX_NOT_FOUND if receipt missing', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(null)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'TX_NOT_FOUND',
    })
  })

  it('throws TX_FAILED if transaction reverted', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...mockReceipt,
      status: 'reverted',
    } as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'TX_FAILED',
    })
  })

  it('throws TX_NOT_CONFIRMED when confirmations are insufficient', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(1)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'TX_NOT_CONFIRMED',
    })
  })

  it('throws EVENT_NOT_FOUND when event missing', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('rejects event emitted from non-marketplace contract', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([
      {
        address: '0xBADCONTRACT',
        args: validArgs,
      },
    ] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'INVALID_EVENT_SOURCE',
    })
  })

  it('throws DATA_CID_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([
      {
        address: '0xmarketplace',
        args: { ...validArgs, dataCid: 'wrong' },
      },
    ] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'DATA_CID_MISMATCH',
    })
  })

  it('throws ENVELOPE_CID_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([
      {
        address: '0xmarketplace',
        args: { ...validArgs, envelopeCid: 'wrong' },
      },
    ] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'ENVELOPE_CID_MISMATCH',
    })
  })

  it('throws ENVELOPE_HASH_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([
      {
        address: '0xmarketplace',
        args: { ...validArgs, envelopeHash: '0xdead' },
      },
    ] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'ENVELOPE_HASH_MISMATCH',
    })
  })

  it('throws PRICE_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([
      {
        address: '0xmarketplace',
        args: { ...validArgs, priceUsdc: 1n },
      },
    ] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toMatchObject({
      code: 'PRICE_MISMATCH',
    })
  })

  it('returns verified listing data when valid', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(publicClient.getTransactionConfirmations).mockResolvedValue(3)

    vi.mocked(parseEventLogs).mockReturnValue([
      {
        address: '0xmarketplace',
        args: validArgs,
      },
    ] as any)

    const result = await verifyListingCreation(VALID_INPUT)

    expect(result.onchainId).toBe(1)
    expect(result.priceUsdc).toBe('10000000')
    expect(result.blockNumber).toBe(100)
    expect(result.sellerAddress).toBe(validArgs.seller)
  })
})
