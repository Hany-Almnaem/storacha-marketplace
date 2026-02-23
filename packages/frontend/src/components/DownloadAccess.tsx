'use client'

import { AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

import { buildAuthHeader } from '@/lib/authHeader'
import { loadBuyerPrivateKey } from '@/lib/buyerKeys'
import { decryptAndDownload } from '@/lib/download'
import { decryptFile, sha256 } from '@/lib/encryption'
import { validateEnvelope } from '@/lib/envelope'
import type { EncryptionEnvelope } from '@/lib/envelope'
import { fetchFromGateway } from '@/lib/gateway'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

type DownloadStatus =
  | 'idle'
  | 'fetching-access'
  | 'fetching-key'
  | 'decrypting-key'
  | 'fetching-envelope'
  | 'fetching-data'
  | 'decrypting'
  | 'done'
  | 'error'

interface AccessResponse {
  dataCid: string
  envelopeCid: string
  keyCid: string
}

export interface DownloadAccessProps {
  purchaseId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readRequiredString(
  value: Record<string, unknown>,
  field: keyof AccessResponse
): string {
  const raw = value[field]
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`Access response is missing "${field}"`)
  }

  return raw
}

function parseAccessResponse(value: unknown): AccessResponse {
  if (!isRecord(value)) {
    throw new Error('Invalid access response format')
  }

  return {
    dataCid: readRequiredString(value, 'dataCid'),
    envelopeCid: readRequiredString(value, 'envelopeCid'),
    keyCid: readRequiredString(value, 'keyCid'),
  }
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (isRecord(body) && typeof body['error'] === 'string' && body['error']) {
      return body['error']
    }
  } catch {
    // ignore JSON parse errors and use fallback
  }

  return fallback
}

async function decryptDeliveredAesKey(
  encryptedKeyBlob: ArrayBuffer,
  privateKey: CryptoKey
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedKeyBlob
    )
  } catch (error) {
    throw new Error(
      `Unable to decrypt delivered key: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

async function importAesDecryptionKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
  if (rawKey.byteLength !== 32) {
    throw new Error(
      `Invalid decrypted AES key length: expected 32 bytes, got ${rawKey.byteLength}`
    )
  }

  try {
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )
  } catch (error) {
    throw new Error(
      `Failed to import decrypted AES key: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

function parseEnvelope(buffer: ArrayBuffer): EncryptionEnvelope {
  let parsed: unknown

  try {
    parsed = JSON.parse(new TextDecoder().decode(buffer))
  } catch (error) {
    throw new Error(
      `Envelope is not valid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  if (!validateEnvelope(parsed)) {
    throw new Error('Envelope validation failed')
  }

  return parsed
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

const STATUS_LABELS: Record<DownloadStatus, string> = {
  idle: 'Decrypt & Download',
  'fetching-access': 'Fetching access...',
  'fetching-key': 'Fetching encrypted key...',
  'decrypting-key': 'Decrypting key...',
  'fetching-envelope': 'Fetching envelope...',
  'fetching-data': 'Fetching encrypted file...',
  decrypting: 'Verifying and decrypting...',
  done: 'Download Complete',
  error: 'Retry Download',
}

export function DownloadAccess({ purchaseId }: DownloadAccessProps) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dataProgress, setDataProgress] = useState<{
    loaded: number
    total: number
  } | null>(null)

  const isWorking = status !== 'idle' && status !== 'done' && status !== 'error'

  async function handleAccessDownload() {
    if (!address) {
      setStatus('error')
      setError('Connect your wallet to access purchased files.')
      return
    }

    setError(null)
    setDataProgress(null)

    try {
      setStatus('fetching-access')

      const authHeader = await buildAuthHeader(
        address,
        signMessageAsync,
        'general'
      )
      const accessRes = await fetch(
        `${API_URL}/api/purchases/${purchaseId}/access`,
        {
          headers: { Authorization: authHeader },
          cache: 'no-store',
        }
      )

      if (!accessRes.ok) {
        throw new Error(
          await readErrorMessage(accessRes, 'Failed to fetch purchase access.')
        )
      }

      const accessPayload: unknown = await accessRes.json()
      const access = parseAccessResponse(accessPayload)

      setStatus('fetching-key')
      const encryptedKeyBlob = await fetchFromGateway(access.keyCid)

      setStatus('decrypting-key')
      const buyerPrivateKey = await loadBuyerPrivateKey(purchaseId)
      const rawAesKey = await decryptDeliveredAesKey(
        encryptedKeyBlob,
        buyerPrivateKey
      )
      const aesKey = await importAesDecryptionKey(rawAesKey)

      setStatus('fetching-envelope')
      const envelopeBuffer = await fetchFromGateway(access.envelopeCid)
      const envelope = parseEnvelope(envelopeBuffer)

      setStatus('fetching-data')
      const encryptedData = await fetchFromGateway(
        access.dataCid,
        (loaded: number, total: number) => {
          setDataProgress({ loaded, total })
        }
      )

      setStatus('decrypting')
      const decryptedData = await decryptFile(encryptedData, aesKey)
      const plaintextHash = await sha256(decryptedData)

      if (plaintextHash !== envelope.plaintext_sha256) {
        throw new Error('File integrity check failed. Envelope hash mismatch.')
      }

      await decryptAndDownload(
        encryptedData,
        aesKey,
        envelope.orig_filename,
        envelope.content_type
      )

      setStatus('done')
    } catch (downloadError) {
      console.error('Download access flow failed:', downloadError)
      setStatus('error')
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Failed to access this purchase.'
      )
    }
  }

  const progressPercent =
    dataProgress && dataProgress.total > 0
      ? Math.min(
          100,
          Math.round((dataProgress.loaded / dataProgress.total) * 100)
        )
      : null

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleAccessDownload}
        disabled={isWorking}
        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isWorking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {STATUS_LABELS[status]}
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            {STATUS_LABELS[status]}
          </>
        )}
      </button>

      {status === 'fetching-data' && dataProgress && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center justify-between">
            <span>{STATUS_LABELS[status]}</span>
            <span>
              {formatBytes(dataProgress.loaded)}
              {dataProgress.total > 0
                ? ` / ${formatBytes(dataProgress.total)}`
                : ''}
              {progressPercent !== null ? ` (${progressPercent}%)` : ''}
            </span>
          </div>

          {progressPercent !== null && (
            <div className="h-1.5 rounded bg-muted">
              <div
                className="h-1.5 rounded bg-brand-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4" />
          File decrypted and downloaded successfully.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  )
}
