'use client'

import { Download, Copy, AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'

interface KeyBackupPromptProps {
  encryptionKey: CryptoKey
  onBackupConfirmed: () => void
}

export function KeyBackupPrompt({
  encryptionKey,
  onBackupConfirmed,
}: KeyBackupPromptProps) {
  const [keyString, setKeyString] = useState('')
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const exportKey = async () => {
      try {
        const exported = await crypto.subtle.exportKey('jwk', encryptionKey)
        setKeyString(JSON.stringify(exported, null, 2))
      } catch {
        setError('Failed to export encryption key.')
      }
    }
    exportKey()
  }, [encryptionKey])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Clipboard permission denied.')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([keyString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'storacha-encryption-key.json'
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
  }

  const canProceed = confirmed && (copied || downloaded)

  return (
    <div className="card p-8 space-y-6 max-w-2xl mx-auto animate-fade-in">
      {/* Warning Header */}
      <div className="flex items-center gap-3 text-destructive">
        <AlertTriangle className="w-6 h-6" />
        <h2 className="text-xl font-bold">Backup Your Encryption Key</h2>
      </div>

      <p className="text-muted-foreground text-sm">
        This key decrypts your dataset. We do not store it. Losing it means
        permanent data loss.
      </p>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 p-3 rounded text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="bg-muted border border-border rounded-xl p-4 font-mono text-xs overflow-auto max-h-60">
        {keyString || 'Generating key...'}
      </div>

      <div className="flex gap-4">
        <button
          onClick={handleCopy}
          className="btn-outline flex-1 flex items-center justify-center gap-2"
        >
          <Copy className="w-4 h-4" />
          {copied ? 'Copied!' : 'Copy'}
        </button>

        <button
          onClick={handleDownload}
          className="btn-outline flex-1 flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          {downloaded ? 'Downloaded!' : 'Download'}
        </button>
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 accent-brand-500"
        />
        <p className="text-sm text-muted-foreground">
          I confirm I have securely backed up this key.
        </p>
      </div>

      <button
        disabled={!canProceed}
        onClick={onBackupConfirmed}
        className={`btn-primary w-full ${
          !canProceed ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        Continue
      </button>
    </div>
  )
}
