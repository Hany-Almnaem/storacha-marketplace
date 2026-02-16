import { decryptFile } from './encryption'

const IV_LENGTH_BYTES = 12

function assertFilename(filename: string): void {
  if (!filename.trim()) {
    throw new Error('Filename is required')
  }
}

function assertBrowserDownloadSupport(): void {
  if (typeof document === 'undefined') {
    throw new Error('Download is only supported in browser environments')
  }

  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('Browser does not support URL.createObjectURL')
  }
}

export function downloadBlob(
  data: ArrayBuffer,
  filename: string,
  mimeType: string
): void {
  assertFilename(filename)
  assertBrowserDownloadSupport()

  const effectiveMimeType = mimeType.trim() || 'application/octet-stream'
  const blob = new Blob([data], { type: effectiveMimeType })
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

export async function decryptAndDownload(
  encryptedData: ArrayBuffer,
  aesKey: CryptoKey,
  filename: string,
  mimeType: string
): Promise<void> {
  try {
    if (encryptedData.byteLength < IV_LENGTH_BYTES) {
      throw new Error(
        `Invalid encrypted payload: expected IV in first ${IV_LENGTH_BYTES} bytes`
      )
    }

    const iv = encryptedData.slice(0, IV_LENGTH_BYTES)
    if (iv.byteLength !== IV_LENGTH_BYTES) {
      throw new Error('Invalid encrypted payload: missing IV')
    }

    const decrypted = await decryptFile(encryptedData, aesKey)
    downloadBlob(decrypted, filename, mimeType)
  } catch (error) {
    throw new Error(
      `Failed to decrypt and download file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
