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

  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const { data: hash, isPending, writeContract } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash,
  })

  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result)
    setStep('backup')
  }

  const handleBackupConfirmed = () => {
    setStep('details')
  }

  const handleCreateListing = async () => {
    if (!uploadResult || !price) return

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
              // Ignore decoding errors for non-matching events
            }
          }

          if (listingId === null) {
            throw new Error(
              'Could not find ListingCreated event in transaction logs'
            )
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
          console.error('Backend save failed:', err)
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

    if (isConfirmed && !savingBackend && step === 'details') {
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

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Sell New Dataset</h1>
          <p className="mt-2 text-gray-600">
            Securely encrypt, upload, and list your data for sale.
          </p>
        </div>

        <div className="mb-8 flex justify-center items-center gap-4 text-sm font-medium text-gray-500">
          <span className={step === 'upload' ? 'text-blue-600' : ''}>
            1. Upload
          </span>
          <span>→</span>
          <span className={step === 'backup' ? 'text-blue-600' : ''}>
            2. Backup Key
          </span>
          <span>→</span>
          <span className={step === 'details' ? 'text-blue-600' : ''}>
            3. Details
          </span>
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
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-xl font-bold mb-6">Listing Details</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File Name
              </label>
              <div className="text-gray-900 p-2 bg-gray-50 rounded border border-gray-200">
                {uploadResult.fileName} (
                {(uploadResult.fileSize / 1024 / 1024).toFixed(2)} MB)
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Dataset Title"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 h-32"
                placeholder="Describe your dataset..."
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (USDC)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="10.00"
              />
            </div>

            {backendError && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border border-red-200 text-sm">
                Error saving listing: {backendError}
              </div>
            )}

            <button
              onClick={handleCreateListing}
              disabled={
                !price ||
                !title ||
                !description ||
                isPending ||
                isConfirming ||
                savingBackend
              }
              className={`w-full py-3 px-4 rounded-md font-bold text-white transition-colors ${
                !price ||
                !title ||
                !description ||
                isPending ||
                isConfirming ||
                savingBackend
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
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
              <div className="mt-4 text-center text-sm text-gray-500">
                Tx Hash:{' '}
                <span className="font-mono">
                  {hash.slice(0, 10)}...{hash.slice(-8)}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white p-8 rounded-lg shadow-md border border-green-200 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Listing Created!
            </h2>
            <p className="text-gray-600 mb-6">
              Your dataset is now listed for sale on the marketplace.
            </p>
            <a
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors"
            >
              Go to Marketplace
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
