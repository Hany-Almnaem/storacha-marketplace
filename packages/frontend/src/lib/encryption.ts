/**
 * Client-side encryption utilities using Web Crypto API.
 * Implements AES-256-GCM with randomly generated IVs.
 */

/**
 * Generates a new AES-256-GCM encryption key.
 *
 * @param exportable - Whether key can be exported via crypto.subtle.exportKey().
 *   - true: Required for seller key backup flow (PoC default)
 *   - false: Production recommendation (prevents key extraction attacks)
 *
 * Security Note:
 * Exportable keys enable testing key serialization and are required for
 * the seller key backup workflow. However, they allow key material extraction
 * via exportKey(). For production, consider wrapping exported keys with
 * PBKDF2-derived key + AES-KW.
 *
 * @returns CryptoKey suitable for AES-GCM encrypt/decrypt operations
 */
export async function generateKey(exportable = true): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    exportable,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts file data using AES-256-GCM.
 *
 * Output format: [12-byte IV][ciphertext]
 *
 * The IV (initialization vector) is randomly generated per encryption and
 * prepended to the ciphertext. This format allows decryption with just the
 * key, as the IV can be extracted from the encrypted blob.
 *
 * Why 12 bytes? AES-GCM standard recommends 96-bit (12-byte) IVs for optimal
 * performance and security. Longer IVs work but offer no additional security.
 *
 * @param file - File object to encrypt
 * @param key - AES-256-GCM CryptoKey (from generateKey)
 * @returns ArrayBuffer with IV prepended to ciphertext
 * @throws {Error} If encryption fails or File cannot be read
 */
export async function encryptFile(
  file: File,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await file.arrayBuffer()

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )

  const result = new Uint8Array(iv.length + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), iv.length)

  return result.buffer
}

/**
 * Decrypts AES-256-GCM encrypted data.
 *
 * Expects input format: [12-byte IV][ciphertext]
 *
 * @param data - Encrypted ArrayBuffer (IV + ciphertext from encryptFile)
 * @param key - Same CryptoKey used for encryption
 * @returns Decrypted ArrayBuffer (original plaintext)
 * @throws {Error} If:
 *   - Data is too short (< 12 bytes)
 *   - Wrong key used
 *   - Data is corrupted
 *   - Authentication tag verification fails
 */
export async function decryptFile(
  data: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  if (data.byteLength < 12) {
    throw new Error('Invalid encrypted data: too short (< 12 bytes)')
  }

  const iv = new Uint8Array(data.slice(0, 12))
  const ciphertext = new Uint8Array(data.slice(12))

  try {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    )
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Computes SHA-256 hash of data.
 * Used for integrity verification in encryption envelope.
 */
export async function sha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
