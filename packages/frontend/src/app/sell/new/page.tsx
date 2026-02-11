'use client'

import { useState, useEffect } from 'react'
import { parseUnits, decodeEventLog } from 'viem'
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useSignMessage,
} from 'wagmi'

import { KeyBackupPrompt } from '../../../components/KeyBackupPrompt'
import { UploadDataset } from '../../../components/UploadDataset'
import { formatApiError, logValidationError } from '../../../lib/api-error'

const MARKETPLACE_ABI = [
  {
    inputs: [
      { internalType: 'string', name: '_dataCid', type: 'string' },
      { internalType: 'string', name: '_envelopeCid', type: 'string' },
      { internalType: 'bytes32', name: '_envelopeHash', type: 'bytes32' },
      { internalType: 'uint256', name: '_priceUsdc', type: 'uint256' },
    ],
    name: 'createListing',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'listingId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'seller',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'dataCid',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'envelopeCid',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'envelopeHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'priceUsdc',
        type: 'uint256',
      },
    ],
    name: 'ListingCreated',
    type: 'event',
  },
] as const

const MARKETPLACE_ADDRESS =
  (process.env['NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS'] as `0x${string}`) ||
  '0xce383BfDF637772a9C56EEa033B7Eb9129A19999'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

type Step = 'upload' | 'backup' | 'details' | 'success'

interface UploadResult {
  dataCid: string
  envelopeCid: string
  envelopeHash: string
  encryptionKey: CryptoKey
  fileName: string
  fileSize: number
}

const CATEGORIES = ['AI/ML', 'IoT', 'Health', 'Finance', 'Other']

export default function NewListingPage() {
  const [step, setStep] = useState<Step>('upload')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Other')
  const [price, setPrice] = useState('')
  const [savingBackend, setSavingBackend] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const { data: hash, isPending, writeContract } = useWriteContract()
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash })

  const usdcRegex = /^\d+(\.\d{1,6})?$/

  const isValidPrice =
    usdcRegex.test(price) && Number(price) > 0 && Number(price) < 1_000_000_000

  const isFormValid =
    title.trim().length >= 3 && description.trim().length >= 10 && isValidPrice

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result)
    setStep('backup')
  }

  const handleBackupConfirmed = () => {
    setStep('details')
  }

  const handleCreateListing = async () => {
    if (!uploadResult || !isValidPrice) return

    try {
      const priceInUnits = parseUnits(price, 6)

      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'createListing',
        args: [
          uploadResult.dataCid,
          uploadResult.envelopeCid,
          uploadResult.envelopeHash as `0x${string}`,
          priceInUnits,
        ],
      })
    } catch (err) {
      console.error('Transaction failed', err)
    }
  }

  /* ================= BACKEND SAVE ================= */

  useEffect(() => {
    const saveToBackend = async () => {
      if (isConfirmed && receipt && uploadResult && address && !savingBackend) {
        setSavingBackend(true)
        try {
          let listingId: number | null = null

          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: MARKETPLACE_ABI,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName === 'ListingCreated') {
                listingId = Number(decoded.args.listingId)
                break
              }
            } catch {
              console.log('Error')
            }
          }

          if (listingId === null) {
            throw new Error('Could not find ListingCreated event')
          }

          const timestamp = Math.floor(Date.now() / 1000).toString()
          const message = `Create listing on Data Marketplace\nTimestamp: ${timestamp}`
          const signature = await signMessageAsync({ message })
          const authHeader = `signature ${address}:${timestamp}:${signature}`

          const response = await fetch(`${API_URL}/api/listings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
            },
            body: JSON.stringify({
              onchainId: listingId,
              dataCid: uploadResult.dataCid,
              envelopeCid: uploadResult.envelopeCid,
              envelopeHash: uploadResult.envelopeHash,
              title,
              description,
              category,
              priceUsdc: price,
              origFilename: uploadResult.fileName,
              contentType: 'application/octet-stream',
              sellerAddress: address,
            }),
          })

          if (!response.ok) {
            const errData = await response.json()
            logValidationError(errData)
            throw new Error(formatApiError(errData))
          }

          setStep('success')
        } catch (err) {
          setBackendError(
            err instanceof Error
              ? err.message
              : 'Failed to save listing metadata'
          )
        } finally {
          setSavingBackend(false)
        }
      }
    }

    if (isConfirmed && step === 'details') {
      saveToBackend()
    }
  }, [
    isConfirmed,
    receipt,
    uploadResult,
    address,
    title,
    description,
    category,
    price,
    step,
    savingBackend,
    signMessageAsync,
  ])

  /* ================= UI ================= */

  return (
    <main className="min-h-screen bg-background py-16 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground">
            Sell New Dataset
          </h1>
          <p className="mt-4 text-muted-foreground">
            Encrypt, upload, and list your dataset securely.
          </p>
        </div>

        {step === 'upload' && (
          <UploadDataset onUploadComplete={handleUploadComplete} />
        )}

        {step === 'backup' && uploadResult && (
          <KeyBackupPrompt
            encryptionKey={uploadResult.encryptionKey}
            onBackupConfirmed={handleBackupConfirmed}
          />
        )}

        {step === 'details' && uploadResult && (
          <div className="card p-8 space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Listing Details
            </h2>

            {/* File Info */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {uploadResult.fileName}
              </p>
              <p>{(uploadResult.fileSize / 1024 / 1024).toFixed(2)} MB</p>
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium text-foreground">
                Title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => handleBlur('title')}
                className={`w-full rounded-xl border bg-background px-4 py-2 text-foreground transition-all
                focus:ring-2 focus:ring-brand-500 focus:outline-none
                ${
                  touched['title'] && title.trim().length < 3
                    ? 'border-red-500 bg-red-500/5'
                    : 'border-border'
                }`}
              />
              {touched['title'] && title.trim().length < 3 && (
                <p className="text-sm text-red-500 mt-1">
                  Minimum 3 characters required
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-foreground">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => handleBlur('description')}
                className={`w-full rounded-xl border bg-background px-4 py-2 text-foreground transition-all h-32
                focus:ring-2 focus:ring-brand-500 focus:outline-none
                ${
                  touched['description'] && description.trim().length < 10
                    ? 'border-red-500 bg-red-500/5'
                    : 'border-border'
                }`}
              />
              {touched['description'] && description.trim().length < 10 && (
                <p className="text-sm text-red-500 mt-1">
                  Minimum 10 characters required
                </p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="text-sm font-medium text-foreground">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2 text-foreground
                focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Price */}
            <div>
              <label className="text-sm font-medium text-foreground">
                Price (USDC) *
              </label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => handleBlur('price')}
                placeholder="10.00"
                className={`w-full rounded-xl border bg-background px-4 py-2 text-foreground transition-all
                focus:ring-2 focus:ring-brand-500 focus:outline-none
                ${
                  touched['price'] && !isValidPrice
                    ? 'border-red-500 bg-red-500/5'
                    : 'border-border'
                }`}
              />

              {touched['price'] && (
                <>
                  {!price && (
                    <p className="text-sm text-red-500 mt-1">
                      Price is required
                    </p>
                  )}

                  {price && !usdcRegex.test(price) && (
                    <p className="text-sm text-red-500 mt-1">
                      Max 6 decimal places allowed
                    </p>
                  )}

                  {price && usdcRegex.test(price) && Number(price) <= 0 && (
                    <p className="text-sm text-red-500 mt-1">
                      Must be greater than 0
                    </p>
                  )}
                </>
              )}
            </div>

            {backendError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {backendError}
              </div>
            )}

            <button
              onClick={handleCreateListing}
              disabled={
                !isFormValid || isPending || isConfirming || savingBackend
              }
              className={`w-full rounded-xl py-3 px-6 font-semibold text-white
              transition-all duration-200 shadow-sm
              ${
                !isFormValid || isPending || isConfirming || savingBackend
                  ? 'bg-muted opacity-60 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 active:scale-[0.98]'
              }`}
            >
              {isPending
                ? 'Confirm in Wallet...'
                : isConfirming
                  ? 'Confirming Transaction...'
                  : savingBackend
                    ? 'Saving Listing...'
                    : 'Create Listing'}
            </button>

            {hash && (
              <div className="text-sm text-muted-foreground text-center mt-3">
                Tx:{' '}
                <span className="font-mono bg-muted px-2 py-1 rounded">
                  {hash.slice(0, 8)}...{hash.slice(-6)}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="card p-10 text-center">
            <h2 className="text-2xl font-bold text-green-500 mb-4">
              Listing Created!
            </h2>
            <a href="/listing" className="btn-primary px-8 py-3">
              Go to Marketplace
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
