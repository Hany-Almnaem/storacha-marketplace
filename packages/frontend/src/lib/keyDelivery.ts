'use client'

const RSA_OAEP_PARAMS: RsaHashedImportParams = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
}

const AES_GCM_PARAMS: AesKeyAlgorithm = {
  name: 'AES-GCM',
  length: 256,
}

function decodeBase64(base64: string): string {
  const normalized = base64.trim()
  if (!normalized) {
    throw new Error('Public key must be a non-empty base64 string')
  }

  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function assertJsonWebKey(value: unknown): asserts value is JsonWebKey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Decoded value is not a valid JWK object')
  }
}

function validateAesJwk(jwk: JsonWebKey): void {
  if (jwk.kty !== 'oct' || typeof jwk.k !== 'string' || !jwk.k) {
    throw new Error('Invalid AES key JWK')
  }
}

async function importAesKeyFromJwk(aesKeyJwk: JsonWebKey): Promise<CryptoKey> {
  validateAesJwk(aesKeyJwk)

  try {
    return await crypto.subtle.importKey(
      'jwk',
      aesKeyJwk,
      AES_GCM_PARAMS,
      true,
      ['encrypt', 'decrypt']
    )
  } catch (error) {
    throw new Error(
      `Failed to import AES key JWK: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export function parsePublicKeyFromBase64(base64: string): JsonWebKey {
  try {
    const decoded = decodeBase64(base64)
    const parsed: unknown = JSON.parse(decoded)
    assertJsonWebKey(parsed)
    return parsed
  } catch (error) {
    throw new Error(
      `Invalid base64-encoded public key: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

async function importRsaPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk.kty !== 'RSA') {
    throw new Error('Buyer public key must be an RSA JWK')
  }

  try {
    return await crypto.subtle.importKey('jwk', jwk, RSA_OAEP_PARAMS, true, [
      'encrypt',
    ])
  } catch (error) {
    throw new Error(
      `Failed to import buyer RSA public key: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export async function encryptKeyForBuyer(
  aesKeyJwk: JsonWebKey,
  buyerPublicKeyJwk: JsonWebKey
): Promise<Uint8Array> {
  try {
    const aesKey = await importAesKeyFromJwk(aesKeyJwk)
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
    const buyerPublicKey = await importRsaPublicKey(buyerPublicKeyJwk)

    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      buyerPublicKey,
      rawAesKey
    )

    return new Uint8Array(encryptedKey)
  } catch (error) {
    throw new Error(
      `Failed to encrypt key for buyer: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
