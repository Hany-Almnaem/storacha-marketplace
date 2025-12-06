/**
 * Encryption envelope metadata generator.
 * Implements specification Section 3.3 format.
 */

import { sha256 } from './encryption'

/**
 * Encryption envelope metadata structure (v1).
 *
 * This metadata travels alongside encrypted data to document:
 * - Encryption algorithm and parameters
 * - Original file information
 * - Integrity verification (SHA-256 hash)
 *
 * Why this matters: Enables forward compatibility as encryption schemes evolve.
 * Future versions can handle v1, v2, etc. differently.
 */
export interface EncryptionEnvelope {
  version: 'v1'
  enc: 'AES-256-GCM'
  iv_len: 12
  orig_filename: string
  content_type: string
  plaintext_sha256: string
}

/**
 * Generates encryption envelope for a file.
 *
 * @param file - Original plaintext file (before encryption)
 * @param plaintextData - Original file data as ArrayBuffer
 * @returns Envelope metadata object per spec Section 3.3
 */
export async function generateEnvelope(
  file: File,
  plaintextData: ArrayBuffer
): Promise<EncryptionEnvelope> {
  const hash = await sha256(plaintextData)

  return {
    version: 'v1',
    enc: 'AES-256-GCM',
    iv_len: 12,
    orig_filename: file.name,
    content_type: file.type || 'application/octet-stream',
    plaintext_sha256: hash,
  }
}

/**
 * Validates envelope structure.
 *
 * @param envelope - Envelope object to validate
 * @returns true if valid, throws Error otherwise
 */
export function validateEnvelope(
  envelope: any
): envelope is EncryptionEnvelope {
  if (envelope.version !== 'v1') {
    throw new Error(`Unsupported envelope version: ${envelope.version}`)
  }
  if (envelope.enc !== 'AES-256-GCM') {
    throw new Error(`Unsupported encryption algorithm: ${envelope.enc}`)
  }
  if (envelope.iv_len !== 12) {
    throw new Error(`Invalid IV length: ${envelope.iv_len}`)
  }
  if (!envelope.plaintext_sha256 || envelope.plaintext_sha256.length !== 64) {
    throw new Error('Invalid or missing plaintext_sha256')
  }
  return true
}
