import { describe, it, expect } from 'vitest'

import { generateKey, encryptFile, decryptFile, sha256 } from '../encryption'

describe('encryption utilities', () => {
  it('generates 256-bit AES-GCM key', async () => {
    const key = await generateKey()
    expect(key.type).toBe('secret')
    expect(key.algorithm).toMatchObject({
      name: 'AES-GCM',
      length: 256,
    })
  })

  it('generates exportable key by default', async () => {
    const key = await generateKey(true)
    const exported = await crypto.subtle.exportKey('raw', key)
    expect(exported.byteLength).toBe(32) // 256 bits = 32 bytes
  })

  it('generates non-exportable key when specified', async () => {
    const key = await generateKey(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('encrypts and decrypts file correctly', async () => {
    const key = await generateKey()
    const original = new File(['test content'], 'test.txt', {
      type: 'text/plain',
    })

    const encrypted = await encryptFile(original, key)
    const decrypted = await decryptFile(encrypted, key)

    const decryptedText = new TextDecoder().decode(decrypted)
    expect(decryptedText).toBe('test content')
  })

  it('prepends 12-byte IV to ciphertext', async () => {
    const key = await generateKey()
    const file = new File(['test'], 'test.txt')

    const encrypted = await encryptFile(file, key)
    const iv = new Uint8Array(encrypted.slice(0, 12))

    expect(iv.length).toBe(12)
    expect(encrypted.byteLength).toBeGreaterThan(12)
  })

  it('generates unique IV per encryption', async () => {
    const key = await generateKey()
    const file = new File(['test'], 'test.txt')

    const encrypted1 = await encryptFile(file, key)
    const encrypted2 = await encryptFile(file, key)

    const iv1 = new Uint8Array(encrypted1.slice(0, 12))
    const iv2 = new Uint8Array(encrypted2.slice(0, 12))

    expect(iv1).not.toEqual(iv2)
  })

  it('throws on decryption with wrong key', async () => {
    const key1 = await generateKey()
    const key2 = await generateKey()
    const file = new File(['test'], 'test.txt')

    const encrypted = await encryptFile(file, key1)

    await expect(decryptFile(encrypted, key2)).rejects.toThrow(
      'Decryption failed'
    )
  })

  it('throws on decryption of corrupted data', async () => {
    const key = await generateKey()
    const file = new File(['test'], 'test.txt')

    const encrypted = await encryptFile(file, key)
    const corrupted = new Uint8Array(encrypted)
    if (corrupted[20] !== undefined) {
      corrupted[20] ^= 0xff // Flip bits
    }

    await expect(decryptFile(corrupted.buffer, key)).rejects.toThrow()
  })

  it('throws on decryption of data too short', async () => {
    const key = await generateKey()
    const tooShort = new Uint8Array(10).buffer

    await expect(decryptFile(tooShort, key)).rejects.toThrow(
      'Invalid encrypted data: too short'
    )
  })

  it('handles various file sizes', async () => {
    const key = await generateKey()
    const sizes = [1024, 102400, 1048576] // 1KB, 100KB, 1MB

    for (const size of sizes) {
      const data = new Uint8Array(size).fill(65) // Fill with 'A'
      const file = new File([data], 'test.bin')

      const encrypted = await encryptFile(file, key)
      const decrypted = await decryptFile(encrypted, key)

      expect(decrypted.byteLength).toBe(size)
    }
  })

  it('computes SHA-256 hash correctly', async () => {
    const data = new TextEncoder().encode('hello world')
    const hash = await sha256(data.buffer)

    expect(hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
  })

  it('handles empty file encryption', async () => {
    const key = await generateKey()
    const emptyFile = new File([], 'empty.txt')

    const encrypted = await encryptFile(emptyFile, key)
    const decrypted = await decryptFile(encrypted, key)

    expect(decrypted.byteLength).toBe(0)
  })

  it('encrypts binary data correctly', async () => {
    const key = await generateKey()
    const binaryData = new Uint8Array([0x00, 0xff, 0xaa, 0x55, 0x12, 0x34])
    const file = new File([binaryData], 'binary.bin')

    const encrypted = await encryptFile(file, key)
    const decrypted = await decryptFile(encrypted, key)

    const decryptedArray = new Uint8Array(decrypted)
    expect(decryptedArray).toEqual(binaryData)
  })

  it('sha256 produces consistent hashes', async () => {
    const data = new TextEncoder().encode('test')
    const hash1 = await sha256(data.buffer)
    const hash2 = await sha256(data.buffer)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // 256 bits = 64 hex chars
  })
})
