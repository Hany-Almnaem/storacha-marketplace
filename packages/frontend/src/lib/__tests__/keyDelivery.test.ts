import { describe, expect, it } from 'vitest'

import { encryptKeyForBuyer, parsePublicKeyFromBase64 } from '../keyDelivery'

const RSA_OAEP_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

const AES_GCM_PARAMS: AesKeyGenParams = {
  name: 'AES-GCM',
  length: 256,
}

function encodeJsonToBase64(value: unknown): string {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
}

async function generateRsaKeypair(): Promise<CryptoKeyPair> {
  const key = await crypto.subtle.generateKey(RSA_OAEP_PARAMS, true, [
    'encrypt',
    'decrypt',
  ])

  if (!('publicKey' in key) || !('privateKey' in key)) {
    throw new Error('Expected RSA keypair')
  }

  return key
}

describe('keyDelivery', () => {
  it('parses base64-encoded JWK', async () => {
    const buyerKeyPair = await generateRsaKeypair()
    const publicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      buyerKeyPair.publicKey
    )

    const encoded = encodeJsonToBase64(publicKeyJwk)
    const parsed = parsePublicKeyFromBase64(encoded)

    expect(parsed.kty).toBe('RSA')
    expect(parsed.n).toBe(publicKeyJwk.n)
    expect(parsed.e).toBe(publicKeyJwk.e)
  })

  it('encrypts AES key for buyer and decrypts it with buyer private key', async () => {
    const buyerKeyPair = await generateRsaKeypair()
    const buyerPublicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      buyerKeyPair.publicKey
    )

    const aesKey = await crypto.subtle.generateKey(AES_GCM_PARAMS, true, [
      'encrypt',
      'decrypt',
    ])

    if (!('type' in aesKey) || aesKey.type !== 'secret') {
      throw new Error('Expected AES secret key')
    }

    const aesKeyJwk = await crypto.subtle.exportKey('jwk', aesKey)
    const encrypted = await encryptKeyForBuyer(aesKeyJwk, buyerPublicKeyJwk)

    const decryptedRaw = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      buyerKeyPair.privateKey,
      encrypted
    )

    const originalRaw = await crypto.subtle.exportKey('raw', aesKey)
    expect(new Uint8Array(decryptedRaw)).toEqual(new Uint8Array(originalRaw))
  })

  it('throws for invalid base64 input', () => {
    expect(() => parsePublicKeyFromBase64('not-base64-data')).toThrow(
      'Invalid base64-encoded public key'
    )
  })

  it('throws when buyer key is not RSA', async () => {
    const aesKey = await crypto.subtle.generateKey(AES_GCM_PARAMS, true, [
      'encrypt',
      'decrypt',
    ])

    if (!('type' in aesKey) || aesKey.type !== 'secret') {
      throw new Error('Expected AES secret key')
    }

    const aesJwk = await crypto.subtle.exportKey('jwk', aesKey)

    await expect(encryptKeyForBuyer(aesJwk, aesJwk)).rejects.toThrow(
      'Buyer public key must be an RSA JWK'
    )
  })

  it('throws when AES JWK is invalid', async () => {
    const buyerKeyPair = await generateRsaKeypair()
    const buyerPublicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      buyerKeyPair.publicKey
    )

    await expect(
      encryptKeyForBuyer({ kty: 'RSA' }, buyerPublicKeyJwk)
    ).rejects.toThrow('Invalid AES key JWK')
  })
})
