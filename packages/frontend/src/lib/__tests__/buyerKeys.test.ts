import { describe, it, expect } from 'vitest'

import { getOrCreateBuyerKeypair, loadBuyerPrivateKey } from '../buyerKeys'

describe('buyerKeys', () => {
  const purchaseId = 'test-purchase-1'

  it('generates and stores a new keypair', async () => {
    const result = await getOrCreateBuyerKeypair(purchaseId)

    expect(result).toHaveProperty('publicKeyBase64')
    expect(typeof result.publicKeyBase64).toBe('string')

    const privateKey = await loadBuyerPrivateKey(purchaseId)

    expect(privateKey).toBeDefined()
    expect(privateKey.type).toBe('private')
  })

  it('does not regenerate keypair if already exists', async () => {
    const first = await getOrCreateBuyerKeypair(purchaseId)
    const second = await getOrCreateBuyerKeypair(purchaseId)

    expect(first.publicKeyBase64).toBe(second.publicKeyBase64)
  })

  it('throws if private key does not exist', async () => {
    await expect(loadBuyerPrivateKey('non-existent-id')).rejects.toThrow(
      'Private key not found'
    )
  })

  it('generates different keys for different purchases', async () => {
    const a = await getOrCreateBuyerKeypair('p1')
    const b = await getOrCreateBuyerKeypair('p2')

    expect(a.publicKeyBase64).not.toBe(b.publicKeyBase64)
  })

  it('returns valid base64 public key', async () => {
    const { publicKeyBase64 } = await getOrCreateBuyerKeypair('p3')

    const decoded = atob(publicKeyBase64)
    expect(() => JSON.parse(decoded)).not.toThrow()
  })
})
