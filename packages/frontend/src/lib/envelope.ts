/**
 * Encryption envelope metadata generator.
 * Implements specification Section 3.3 format.
 */

import { sha256 } from './encryption'

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
 * Type guard to check if unknown value is EncryptionEnvelope
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validates envelope structure safely (no `any`)
 */
export function validateEnvelope(
  envelope: unknown
): envelope is EncryptionEnvelope {
  if (!isRecord(envelope)) {
    throw new Error('Envelope must be an object')
  }

  if (envelope['version'] !== 'v1') {
    throw new Error(
      `Unsupported envelope version: ${String(envelope['version'])}`
    )
  }

  if (envelope['enc'] !== 'AES-256-GCM') {
    throw new Error(
      `Unsupported encryption algorithm: ${String(envelope['enc'])}`
    )
  }

  if (envelope['iv_len'] !== 12) {
    throw new Error(`Invalid IV length: ${String(envelope['iv_len'])}`)
  }

  if (
    typeof envelope['plaintext_sha256'] !== 'string' ||
    envelope['plaintext_sha256'].length !== 64
  ) {
    throw new Error('Invalid or missing plaintext_sha256')
  }

  if (typeof envelope['orig_filename'] !== 'string') {
    throw new Error('Invalid or missing orig_filename')
  }

  if (typeof envelope['content_type'] !== 'string') {
    throw new Error('Invalid or missing content_type')
  }

  return true
}
