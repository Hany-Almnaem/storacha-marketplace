import { describe, it, expect } from 'vitest'

import { generateEnvelope, validateEnvelope } from '../envelope'

describe('envelope utilities', () => {
  it('generates valid envelope metadata', async () => {
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
    const data = await file.arrayBuffer()

    const envelope = await generateEnvelope(file, data)

    expect(envelope.version).toBe('v1')
    expect(envelope.enc).toBe('AES-256-GCM')
    expect(envelope.iv_len).toBe(12)
    expect(envelope.orig_filename).toBe('test.txt')
    expect(envelope.content_type).toBe('text/plain')
    expect(envelope.plaintext_sha256).toHaveLength(64)
  })

  it('defaults content type when missing', async () => {
    const file = new File(['test'], 'test.bin')
    const data = await file.arrayBuffer()

    const envelope = await generateEnvelope(file, data)

    expect(envelope.content_type).toBe('application/octet-stream')
  })

  it('computes correct SHA-256 hash', async () => {
    const content = 'hello world'
    const file = new File([content], 'test.txt', { type: 'text/plain' })
    const data = await file.arrayBuffer()

    const envelope = await generateEnvelope(file, data)

    expect(envelope.plaintext_sha256).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
  })

  it('validates correct envelope', () => {
    const envelope = {
      version: 'v1',
      enc: 'AES-256-GCM',
      iv_len: 12,
      orig_filename: 'test.txt',
      content_type: 'text/plain',
      plaintext_sha256: 'a'.repeat(64),
    }

    expect(() => validateEnvelope(envelope)).not.toThrow()
    expect(validateEnvelope(envelope)).toBe(true)
  })

  it('rejects invalid version', () => {
    const envelope = {
      version: 'v2',
      enc: 'AES-256-GCM',
      iv_len: 12,
      orig_filename: 'test.txt',
      content_type: 'text/plain',
      plaintext_sha256: 'a'.repeat(64),
    }

    expect(() => validateEnvelope(envelope)).toThrow(
      'Unsupported envelope version'
    )
  })

  it('rejects invalid encryption algorithm', () => {
    const envelope = {
      version: 'v1',
      enc: 'AES-128-CBC',
      iv_len: 12,
      orig_filename: 'test.txt',
      content_type: 'text/plain',
      plaintext_sha256: 'a'.repeat(64),
    }

    expect(() => validateEnvelope(envelope)).toThrow(
      'Unsupported encryption algorithm'
    )
  })

  it('rejects invalid IV length', () => {
    const envelope = {
      version: 'v1',
      enc: 'AES-256-GCM',
      iv_len: 16,
      orig_filename: 'test.txt',
      content_type: 'text/plain',
      plaintext_sha256: 'a'.repeat(64),
    }

    expect(() => validateEnvelope(envelope)).toThrow('Invalid IV length')
  })

  it('rejects invalid hash length', () => {
    const envelope = {
      version: 'v1',
      enc: 'AES-256-GCM',
      iv_len: 12,
      orig_filename: 'test.txt',
      content_type: 'text/plain',
      plaintext_sha256: 'tooshort',
    }

    expect(() => validateEnvelope(envelope)).toThrow(
      'Invalid or missing plaintext_sha256'
    )
  })

  it('rejects missing hash', () => {
    const envelope = {
      version: 'v1',
      enc: 'AES-256-GCM',
      iv_len: 12,
      orig_filename: 'test.txt',
      content_type: 'text/plain',
    }

    expect(() => validateEnvelope(envelope)).toThrow(
      'Invalid or missing plaintext_sha256'
    )
  })

  it('handles various file types', async () => {
    const testCases = [
      { content: 'text', filename: 'test.txt', type: 'text/plain' },
      {
        content: '{"key":"value"}',
        filename: 'data.json',
        type: 'application/json',
      },
      { content: 'a,b,c\n1,2,3', filename: 'data.csv', type: 'text/csv' },
    ]

    for (const testCase of testCases) {
      const file = new File([testCase.content], testCase.filename, {
        type: testCase.type,
      })
      const data = await file.arrayBuffer()
      const envelope = await generateEnvelope(file, data)

      expect(envelope.orig_filename).toBe(testCase.filename)
      expect(envelope.content_type).toBe(testCase.type)
      expect(envelope.plaintext_sha256).toHaveLength(64)
    }
  })

  it('preserves filename with special characters', async () => {
    const file = new File(['test'], 'my-file_v1.2.3 (final).txt', {
      type: 'text/plain',
    })
    const data = await file.arrayBuffer()

    const envelope = await generateEnvelope(file, data)

    expect(envelope.orig_filename).toBe('my-file_v1.2.3 (final).txt')
  })
})
