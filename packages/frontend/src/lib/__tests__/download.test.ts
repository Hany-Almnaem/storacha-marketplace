import { afterEach, describe, expect, it, vi } from 'vitest'

import { decryptAndDownload, downloadBlob } from '../download'
import { encryptFile, generateKey } from '../encryption'

interface BrowserMocks {
  anchor: {
    href: string
    download: string
    rel: string
    style: { display: string }
    click: ReturnType<typeof vi.fn>
  }
  createElement: ReturnType<typeof vi.fn>
  appendChild: ReturnType<typeof vi.fn>
  removeChild: ReturnType<typeof vi.fn>
  createObjectURL: ReturnType<typeof vi.fn>
  revokeObjectURL: ReturnType<typeof vi.fn>
}

function setupBrowserMocks(): BrowserMocks {
  const anchor = {
    href: '',
    download: '',
    rel: '',
    style: { display: '' },
    click: vi.fn(),
  }

  const createElement = vi.fn().mockImplementation((tagName: string) => {
    if (tagName !== 'a') {
      throw new Error(`Unexpected element tag: ${tagName}`)
    }
    return anchor
  })

  const appendChild = vi.fn()
  const removeChild = vi.fn()

  const createObjectURL = vi.fn().mockReturnValue('blob:mock-download-url')
  const revokeObjectURL = vi.fn()

  vi.stubGlobal('document', {
    createElement,
    body: {
      appendChild,
      removeChild,
    },
  })

  vi.stubGlobal('URL', {
    createObjectURL,
    revokeObjectURL,
  })

  return {
    anchor,
    createElement,
    appendChild,
    removeChild,
    createObjectURL,
    revokeObjectURL,
  }
}

describe('download utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('creates Blob with provided MIME type and triggers download', async () => {
    const mocks = setupBrowserMocks()
    const payload = new TextEncoder().encode('pdf-data').buffer

    downloadBlob(payload, 'report.pdf', 'application/pdf')

    expect(mocks.createElement).toHaveBeenCalledWith('a')
    expect(mocks.anchor.download).toBe('report.pdf')
    expect(mocks.anchor.href).toBe('blob:mock-download-url')
    expect(mocks.anchor.click).toHaveBeenCalledTimes(1)
    expect(mocks.appendChild).toHaveBeenCalledWith(mocks.anchor)
    expect(mocks.removeChild).toHaveBeenCalledWith(mocks.anchor)
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1)
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:mock-download-url')

    const createdBlob = mocks.createObjectURL.mock.calls[0]?.[0]
    expect(createdBlob).toBeInstanceOf(Blob)
    expect((createdBlob as Blob).type).toBe('application/pdf')
  })

  it('preserves filename exactly as provided', () => {
    const mocks = setupBrowserMocks()
    const payload = new Uint8Array([1, 2, 3]).buffer
    const filename = 'dataset final (v2).bin'

    downloadBlob(payload, filename, 'application/octet-stream')

    expect(mocks.anchor.download).toBe(filename)
  })

  it('uses octet-stream fallback when MIME type is empty', () => {
    const mocks = setupBrowserMocks()
    const payload = new Uint8Array([7, 8, 9]).buffer

    downloadBlob(payload, 'file.bin', '   ')

    const createdBlob = mocks.createObjectURL.mock.calls[0]?.[0] as Blob
    expect(createdBlob.type).toBe('application/octet-stream')
  })

  it('decrypts encrypted payload and downloads plaintext bytes', async () => {
    const mocks = setupBrowserMocks()
    const key = await generateKey()
    const file = new File(['secret-content'], 'secret.txt', {
      type: 'text/plain',
    })

    const encrypted = await encryptFile(file, key)
    await decryptAndDownload(encrypted, key, 'secret.txt', 'text/plain')

    const createdBlob = mocks.createObjectURL.mock.calls[0]?.[0] as Blob
    const downloadedBytes = await createdBlob.arrayBuffer()
    const downloadedText = new TextDecoder().decode(downloadedBytes)

    expect(downloadedText).toBe('secret-content')
    expect(createdBlob.type).toBe('text/plain')
    expect(mocks.anchor.download).toBe('secret.txt')
  })

  it('throws on invalid encrypted payload shorter than IV', async () => {
    const key = await generateKey()
    const invalidData = new Uint8Array(10).buffer

    await expect(
      decryptAndDownload(invalidData, key, 'x.bin', 'application/octet-stream')
    ).rejects.toThrow('expected IV in first 12 bytes')
  })

  it('throws when filename is empty', () => {
    setupBrowserMocks()
    const payload = new Uint8Array([0]).buffer

    expect(() => downloadBlob(payload, '   ', 'text/plain')).toThrow(
      'Filename is required'
    )
  })
})
