import * as React from 'react'
import { useState, useCallback } from 'react'
import { keccak256, toHex } from 'viem'

import { generateKey, encryptFile } from '../lib/encryption'
import { generateEnvelope } from '../lib/envelope'
import { initializeClient, getOrCreateSpace, uploadBlob } from '../lib/storacha'

interface UploadDatasetProps {
  onUploadComplete: (result: {
    dataCid: string
    envelopeCid: string
    envelopeHash: string
    encryptionKey: CryptoKey
    fileName: string
    fileSize: number
  }) => void
}

export function UploadDataset({ onUploadComplete }: UploadDatasetProps) {
  const [file, setFile] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<
    'idle' | 'encrypting' | 'uploading' | 'complete' | 'error'
  >('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
      setError(null)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleUpload = async () => {
    if (!file || !email) {
      setError('Please provide both a file and your email address.')
      return
    }

    try {
      setStatus('encrypting')
      setProgress(10)

      const key = await generateKey(true)
      setProgress(20)

      const fileBuffer = await file.arrayBuffer()

      const envelope = await generateEnvelope(file, fileBuffer)

      const envelopeString = JSON.stringify(envelope)
      const envelopeHash = keccak256(toHex(envelopeString))

      const encryptedData = await encryptFile(file, key)
      setProgress(40)

      setStatus('uploading')

      const client = await initializeClient(email)
      setProgress(50)

      await getOrCreateSpace(client, 'storacha-marketplace')
      setProgress(60)

      const envelopeBlob = new TextEncoder().encode(envelopeString)
      const envelopeCid = await uploadBlob(client, envelopeBlob)
      setProgress(80)

      const dataCid = await uploadBlob(client, new Uint8Array(encryptedData))
      setProgress(100)

      setStatus('complete')
      onUploadComplete({
        dataCid,
        envelopeCid,
        envelopeHash,
        encryptionKey: key,
        fileName: file.name,
        fileSize: file.size,
      })
    } catch (err) {
      console.error('Upload failed:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold mb-6">Upload Dataset</h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Storacha Account Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            disabled={status !== 'idle' && status !== 'error'}
          />
          <p className="mt-1 text-sm text-gray-500">
            Used to authenticate with Storacha network.
          </p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            file
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {file ? (
            <div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <button
                onClick={() => setFile(null)}
                className="mt-2 text-sm text-red-600 hover:text-red-800"
                disabled={status !== 'idle' && status !== 'error'}
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <p className="text-gray-700">
                Drag and drop your dataset here, or
              </p>
              <label className="mt-2 inline-block cursor-pointer">
                <span className="text-blue-600 hover:text-blue-800 font-medium">
                  browse files
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={status !== 'idle' && status !== 'error'}
                />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
            {error}
          </div>
        )}

        {(status === 'encrypting' || status === 'uploading') && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span className="font-medium">
                {status === 'encrypting'
                  ? 'Encrypting...'
                  : progress === 40
                    ? 'Waiting for email verification...'
                    : 'Uploading to Storacha...'}
              </span>
              <span>{progress}%</span>
            </div>

            {progress === 40 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 animate-pulse">
                <p className="font-bold">⚠️ Action Required</p>
                <p>
                  We sent a verification email to <strong>{email}</strong>.
                </p>
                <p className="mt-1">
                  Please click the link in that email to approve this device.
                  The upload will resume automatically once verified.
                </p>
                <p className="mt-2 text-xs text-amber-900 font-semibold">
                  Already verified? Click "Cancel & Try Again" then "Encrypt &
                  Upload" to resume.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setStatus('idle')
                      setProgress(0)
                      setError(null)
                    }}
                    className="px-3 py-1 bg-white border border-amber-300 rounded text-xs hover:bg-amber-50 text-amber-900"
                  >
                    Cancel & Try Again
                  </button>
                </div>
              </div>
            )}

            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={
            !file || !email || (status !== 'idle' && status !== 'error')
          }
          className={`w-full py-3 px-4 rounded-md font-bold text-white transition-colors ${
            !file || !email || (status !== 'idle' && status !== 'error')
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {status === 'idle' || status === 'error'
            ? 'Encrypt & Upload'
            : 'Processing...'}
        </button>
      </div>
    </div>
  )
}
