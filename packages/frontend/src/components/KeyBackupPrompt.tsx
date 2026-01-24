import { useState, useEffect } from 'react'

interface KeyBackupPromptProps {
  encryptionKey: CryptoKey
  onBackupConfirmed: () => void
}

export function KeyBackupPrompt({
  encryptionKey,
  onBackupConfirmed,
}: KeyBackupPromptProps) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [keyString, setKeyString] = useState<string>('')

  useEffect(() => {
    const exportKey = async () => {
      try {
        const exported = await crypto.subtle.exportKey('jwk', encryptionKey)
        setKeyString(JSON.stringify(exported, null, 2))
      } catch (err) {
        console.error('Failed to export key', err)
      }
    }
    exportKey()
  }, [encryptionKey])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(keyString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([keyString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'storacha-dataset-key.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-red-600">
        ⚠️ Important: Backup Your Encryption Key
      </h2>

      <p className="mb-4 text-gray-700">
        This key is required to decrypt your dataset. We do <strong>not</strong>{' '}
        store this key. If you lose it, your data will be permanently
        inaccessible.
      </p>

      <div className="bg-gray-50 p-4 rounded mb-4 font-mono text-sm overflow-x-auto border border-gray-300">
        <pre>{keyString || 'Generating key...'}</pre>
      </div>

      <div className="flex gap-4 mb-6">
        <button
          onClick={handleCopy}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>

        <button
          onClick={handleDownload}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
        >
          Download .json
        </button>
      </div>

      <div className="flex items-start gap-3 mb-6">
        <input
          type="checkbox"
          id="confirm-backup"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
        />
        <label
          htmlFor="confirm-backup"
          className="text-sm text-gray-700 cursor-pointer"
        >
          I verify that I have securely backed up this encryption key. I
          understand that Storacha Marketplace cannot recover it for me.
        </label>
      </div>

      <button
        onClick={onBackupConfirmed}
        disabled={!confirmed}
        className={`w-full font-bold py-3 px-4 rounded ${
          confirmed
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 cursor-not-allowed text-gray-500'
        } transition-colors`}
      >
        Continue to Listing
      </button>
    </div>
  )
}
