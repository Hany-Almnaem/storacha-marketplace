import { describe, it, expect, vi } from 'vitest'
import { verifyPurchase, TxVerificationErrorCode } from '../services/txVerification'

vi.mock('../config/chain', () => ({
  publicClient: {
    getTransactionReceipt: vi.fn(),
    getBlockNumber: vi.fn(),
  },
  MARKETPLACE_ADDRESS: '0xmarketplace',
  CONFIRMATIONS_REQUIRED: 5,
}))

describe('verifyPurchase', () => {
  it('rejects failed tx', async () => {
    vi.mocked(
      (await import('../config/chain')).publicClient.getTransactionReceipt
    ).mockResolvedValue({
      status: 'reverted',
    } as any)

    await expect(
      verifyPurchase('0x123', 1, '0xbuyer')
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.TX_FAILED,
    })
  })

  it('rejects unconfirmed tx', async () => {
    vi.mocked(
      (await import('../config/chain')).publicClient.getTransactionReceipt
    ).mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      logs: [],
    } as any)

    vi.mocked(
      (await import('../config/chain')).publicClient.getBlockNumber
    ).mockResolvedValue(102n)

    await expect(
      verifyPurchase('0x123', 1, '0xbuyer')
    ).rejects.toMatchObject({
      code: TxVerificationErrorCode.TX_NOT_CONFIRMED,
    })
  })
})
