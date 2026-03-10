import { parseEventLogs, decodeEventLog } from 'viem'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/chain', () => ({
  publicClient: {
    getTransactionReceipt: vi.fn(),
  },
  MARKETPLACE_ABI: [],
}))

vi.mock('viem', () => ({
  parseEventLogs: vi.fn(),
  decodeEventLog: vi.fn(),
}))

import { publicClient } from '@/config/chain'

import { verifyListingCreation } from '../services/listingVerification'
import { ListingVerificationError } from '../types/listingVerification'

const mockReceipt = {
  status: 'success',
  blockNumber: 123n,
  logs: [{}],
}

const VALID_INPUT = {
  txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  dataCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  envelopeCid: 'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq',
  envelopeHash:
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  priceUsdc: '10000000',
}

const decodedEvent = {
  eventName: 'ListingCreated',
  args: {
    listingId: 1n,
    seller: '0x1111111111111111111111111111111111111111',
    dataCid: VALID_INPUT.dataCid,
    envelopeCid: VALID_INPUT.envelopeCid,
    envelopeHash: VALID_INPUT.envelopeHash,
    priceUsdc: 10000000n,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('verifyListingCreation', () => {
  it('throws TX_NOT_FOUND if receipt missing', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(null)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      ListingVerificationError
    )
  })

  it('throws TX_FAILED if tx reverted', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue({
      ...mockReceipt,
      status: 'reverted',
    } as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      'Transaction execution failed'
    )
  })

  it('throws EVENT_NOT_FOUND', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(parseEventLogs).mockReturnValue([] as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      'ListingCreated event not found'
    )
  })

  it('throws DATA_CID_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(parseEventLogs).mockReturnValue([
      { data: '0x', topics: [] },
    ] as any)

    vi.mocked(decodeEventLog).mockReturnValue({
      ...decodedEvent,
      args: { ...decodedEvent.args, dataCid: 'wrong' },
    } as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      'dataCid does not match blockchain'
    )
  })

  it('throws ENVELOPE_CID_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(parseEventLogs).mockReturnValue([
      { data: '0x', topics: [] },
    ] as any)

    vi.mocked(decodeEventLog).mockReturnValue({
      ...decodedEvent,
      args: { ...decodedEvent.args, envelopeCid: 'wrong' },
    } as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      'envelopeCid mismatch'
    )
  })

  it('throws ENVELOPE_HASH_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(parseEventLogs).mockReturnValue([
      { data: '0x', topics: [] },
    ] as any)

    vi.mocked(decodeEventLog).mockReturnValue({
      ...decodedEvent,
      args: { ...decodedEvent.args, envelopeHash: '0xdead' },
    } as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      'envelopeHash mismatch'
    )
  })

  it('throws PRICE_MISMATCH', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(parseEventLogs).mockReturnValue([
      { data: '0x', topics: [] },
    ] as any)

    vi.mocked(decodeEventLog).mockReturnValue({
      ...decodedEvent,
      args: { ...decodedEvent.args, priceUsdc: 1n },
    } as any)

    await expect(verifyListingCreation(VALID_INPUT)).rejects.toThrow(
      'price mismatch'
    )
  })

  it('returns verified listing data', async () => {
    vi.mocked(publicClient.getTransactionReceipt).mockResolvedValue(
      mockReceipt as any
    )

    vi.mocked(parseEventLogs).mockReturnValue([
      { data: '0x', topics: [] },
    ] as any)

    vi.mocked(decodeEventLog).mockReturnValue(decodedEvent as any)

    const result = await verifyListingCreation(VALID_INPUT)

    expect(result.onchainId).toBe(1)
    expect(result.priceUsdc).toBe('10000000')
    expect(result.blockNumber).toBe(123)
  })
})
