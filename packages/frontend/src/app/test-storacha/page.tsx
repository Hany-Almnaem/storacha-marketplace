'use client'

/**
 * Storacha Browser Verification Test
 *
 * This page tests if @storacha/client works correctly in the Next.js browser environment.
 * This is NOT production code - it's a verification test for Issue #4.
 *
 * Test Flow:
 * 1. Initialize client
 * 2. Login with email
 * 3. Verify email (manual step)
 * 4. Create/get space
 * 5. Encrypt and upload test file
 * 6. Download and decrypt
 * 7. Verify integrity
 */

import { useState } from 'react'

import { generateKey, encryptFile, decryptFile, sha256 } from '@/lib/encryption'
import { generateEnvelope, validateEnvelope } from '@/lib/envelope'
import { initializeClient, getOrCreateSpace, uploadBlob } from '@/lib/storacha'

type StorachaClient = Awaited<ReturnType<typeof initializeClient>>

type TestStatus =
  | { step: 'idle' }
  | { step: 'initializing' }
  | { step: 'awaiting_email'; email: string }
  | { step: 'authenticated' }
  | { step: 'creating_space' }
  | { step: 'space_ready'; spaceDID: string }
  | { step: 'encrypting' }
  | { step: 'uploading' }
  | { step: 'uploaded'; cid: string }
  | { step: 'downloading' }
  | { step: 'decrypting' }
  | { step: 'success'; originalHash: string; decryptedHash: string }
  | { step: 'error'; error: string }

export default function TestStorachaPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<TestStatus>({ step: 'idle' })
  const [logs, setLogs] = useState<string[]>([])
  const [clientInstance, setClientInstance] = useState<StorachaClient | null>(
    null
  )

  const addLog = (message: string) => {
    const timestamp =
      new Date().toISOString().split('T')[1]?.split('.')[0] || ''
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`])
    // eslint-disable-next-line no-console
    console.log(message)
  }

  const runTest = async () => {
    try {
      // Step 1: Initialize client
      setStatus({ step: 'initializing' })
      addLog('Step 1: Initializing Storacha client...')

      const client = await initializeClient(email)
      setClientInstance(client)
      addLog('✓ Client initialized successfully')

      // Step 2: Login (triggers email verification)
      setStatus({ step: 'awaiting_email', email })
      addLog('Step 2: Login initiated - CHECK YOUR EMAIL')
      addLog(`Email sent to: ${email}`)
      addLog(
        '⚠️  Click the verification link in your email, then click "Continue Test" button below'
      )

      // We need to wait here for user to verify email
      // The button will trigger the next function
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      setStatus({ step: 'error', error: errorMessage })
      addLog(`❌ Error: ${errorMessage}`)
      // eslint-disable-next-line no-console
      console.error('Test error:', error)
    }
  }

  const continueAfterEmailVerification = async () => {
    try {
      setStatus({ step: 'authenticated' })
      addLog('✓ Email verified, continuing...')

      // Use existing client or re-initialize if needed
      const client = clientInstance || (await initializeClient(email))

      // Step 3: Create or get space
      setStatus({ step: 'creating_space' })
      addLog('Step 3: Creating/getting space...')

      const space = await getOrCreateSpace(client, 'test-space-poc')
      const spaceDID = space.did()

      setStatus({ step: 'space_ready', spaceDID })
      addLog(`✓ Space ready: ${spaceDID}`)
      addLog('💡 Save this DID to .env.local as STORACHA_SPACE_DID')

      // Step 4: Create test file
      addLog('Step 4: Creating test file...')
      const testContent =
        'Hello from Storacha Browser Test! ' + new Date().toISOString()
      const testFile = new File([testContent], 'test.txt', {
        type: 'text/plain',
      })
      const testData = await testFile.arrayBuffer()
      const originalHash = await sha256(testData)
      addLog(`Original file hash: ${originalHash}`)

      // Step 5: Encrypt file
      setStatus({ step: 'encrypting' })
      addLog('Step 5: Encrypting file with AES-256-GCM...')

      const key = await generateKey()
      const encryptedData = await encryptFile(testFile, key)
      addLog(`✓ Encrypted: ${encryptedData.byteLength} bytes`)

      // Step 6: Generate envelope
      addLog('Step 6: Generating encryption envelope...')
      const envelope = await generateEnvelope(testFile, testData)
      validateEnvelope(envelope)
      addLog(
        `✓ Envelope valid: ${envelope.enc}, hash: ${envelope.plaintext_sha256.slice(0, 8)}...`
      )

      // Step 7: Upload to Storacha
      setStatus({ step: 'uploading' })
      addLog('Step 7: Uploading encrypted blob to Storacha...')

      let cid: string
      try {
        cid = await uploadBlob(client, new Uint8Array(encryptedData))

        setStatus({ step: 'uploaded', cid })
        addLog(`✓ Uploaded successfully!`)
        addLog(`CID: ${cid}`)
        addLog(`Gateway URL: https://w3s.link/ipfs/${cid}`)
      } catch (uploadError) {
        const uploadErrorMsg =
          uploadError instanceof Error ? uploadError.message : 'Unknown error'

        if (uploadErrorMsg.includes('space/blob/add')) {
          addLog('❌ Space provisioning issue detected')
          addLog('💡 The space might not be provisioned with your account')
          addLog('💡 Try using an existing space DID from Storacha console')
          throw new Error(`Space provisioning error: ${uploadErrorMsg}`)
        }

        throw uploadError
      }

      // Step 8: Download from gateway
      setStatus({ step: 'downloading' })
      addLog('Step 8: Downloading from gateway...')

      const gatewayUrl = `https://w3s.link/ipfs/${cid}`
      const response = await fetch(gatewayUrl)

      if (!response.ok) {
        throw new Error(`Gateway returned ${response.status}`)
      }

      const downloaded = await response.arrayBuffer()
      addLog(`✓ Downloaded: ${downloaded.byteLength} bytes`)

      // Step 9: Decrypt
      setStatus({ step: 'decrypting' })
      addLog('Step 9: Decrypting downloaded file...')

      const decrypted = await decryptFile(downloaded, key)
      const decryptedHash = await sha256(decrypted)
      addLog(`Decrypted file hash: ${decryptedHash}`)

      // Step 10: Verify integrity
      addLog('Step 10: Verifying integrity...')

      if (originalHash === decryptedHash) {
        setStatus({ step: 'success', originalHash, decryptedHash })
        addLog('✅ SUCCESS! All steps completed successfully!')
        addLog('✅ Hash match verified - data integrity confirmed')
        addLog(
          '✅ @storacha/client works correctly in Next.js browser environment'
        )
      } else {
        throw new Error('Hash mismatch - data corruption detected!')
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      setStatus({ step: 'error', error: errorMessage })
      addLog(`❌ Error: ${errorMessage}`)
      // eslint-disable-next-line no-console
      console.error('Test error:', error)
    }
  }

  const resetTest = () => {
    setStatus({ step: 'idle' })
    setLogs([])
    setEmail('')
    setClientInstance(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Storacha Browser Verification Test
            </h1>
            <p className="text-gray-600">
              Testing @storacha/client integration in Next.js browser
              environment
            </p>
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> This is a verification test for Issue #4.
                Not production code.
              </p>
            </div>
          </div>

          {/* Status Display */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-700">
                Test Status
              </h2>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  status.step === 'success'
                    ? 'bg-green-100 text-green-800'
                    : status.step === 'error'
                      ? 'bg-red-100 text-red-800'
                      : status.step === 'idle'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-blue-100 text-blue-800'
                }`}
              >
                {status.step.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>

            {status.step === 'awaiting_email' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-blue-900 font-medium mb-2">
                  ⚠️ Email Verification Required
                </p>
                <p className="text-blue-700 text-sm mb-3">
                  1. Check your email inbox: <strong>{status.email}</strong>
                  <br />
                  2. Click the verification link from Storacha
                  <br />
                  3. Return here and click "Continue Test" below
                </p>
                <button
                  onClick={continueAfterEmailVerification}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Continue Test (After Email Verification)
                </button>
              </div>
            )}

            {status.step === 'space_ready' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <p className="text-green-900 font-medium">Space DID:</p>
                <p className="text-green-700 text-sm font-mono break-all">
                  {status.spaceDID}
                </p>
              </div>
            )}

            {status.step === 'uploaded' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <p className="text-green-900 font-medium">Upload CID:</p>
                <p className="text-green-700 text-sm font-mono break-all mb-2">
                  {status.cid}
                </p>
                <a
                  href={`https://w3s.link/ipfs/${status.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  View on Gateway →
                </a>
              </div>
            )}

            {status.step === 'success' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <p className="text-green-900 font-bold mb-2">
                  ✅ All Tests Passed!
                </p>
                <p className="text-green-700 text-sm mb-2">Original Hash:</p>
                <p className="text-green-600 text-xs font-mono break-all mb-3">
                  {status.originalHash}
                </p>
                <p className="text-green-700 text-sm mb-2">Decrypted Hash:</p>
                <p className="text-green-600 text-xs font-mono break-all mb-3">
                  {status.decryptedHash}
                </p>
                <p className="text-green-800 font-medium">
                  ✓ @storacha/client works in Next.js browser!
                </p>
              </div>
            )}

            {status.step === 'error' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded">
                <p className="text-red-900 font-bold mb-2">❌ Test Failed</p>
                <p className="text-red-700 text-sm font-mono break-all">
                  {status.error}
                </p>
              </div>
            )}
          </div>

          {/* Email Input Form */}
          {status.step === 'idle' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Storacha Account Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your-email@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                You'll receive a verification email from Storacha
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            {status.step === 'idle' && (
              <button
                onClick={runTest}
                disabled={!email || !email.includes('@')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                Start Verification Test
              </button>
            )}

            {(status.step === 'success' || status.step === 'error') && (
              <button
                onClick={resetTest}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                Reset & Run Again
              </button>
            )}
          </div>

          {/* Logs Display */}
          {logs.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">
                Test Logs
              </h2>
              <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`text-sm font-mono mb-1 ${
                      log.includes('✓') || log.includes('✅')
                        ? 'text-green-400'
                        : log.includes('❌')
                          ? 'text-red-400'
                          : log.includes('⚠️')
                            ? 'text-yellow-400'
                            : log.includes('💡')
                              ? 'text-blue-400'
                              : 'text-gray-300'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">
              Test Instructions:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>Enter your Storacha account email above</li>
              <li>Click "Start Verification Test"</li>
              <li>Check your email inbox for Storacha verification link</li>
              <li>Click the verification link (opens in new tab)</li>
              <li>Return here and click "Continue Test"</li>
              <li>Watch the test complete all steps automatically</li>
              <li>Verify final status is SUCCESS with matching hashes</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
