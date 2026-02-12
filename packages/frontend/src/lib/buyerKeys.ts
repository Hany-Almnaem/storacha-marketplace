'use client'

/**
 * Buyer Key Management Utility
 * --------------------------------
 * - Generates RSA-OAEP keypair per purchase
 * - Stores private key securely in IndexedDB
 * - Exposes public key (Base64 JWK) for backend binding
 * - Allows loading and deletion of private keys
 */

const DB_NAME = 'buyer-keys-db'
const STORE_NAME = 'keys'
const DB_VERSION = 1

/* ------------------------------------------------ */
/* 🗄️ IndexedDB Helpers */
/* ------------------------------------------------ */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function toBase64(obj: unknown): string {
  const json = JSON.stringify(obj)
  return btoa(unescape(encodeURIComponent(json)))
}
/* ------------------------------------------------ */
/* 🔐 Keypair Generation */
/* ------------------------------------------------ */

async function generateKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * Returns existing keypair if present.
 * Otherwise generates and stores a new one.
 */
export async function getOrCreateBuyerKeypair(purchaseId: string): Promise<{
  publicKeyBase64: string
}> {
  const existing = await loadBuyerPrivateKeySafe(purchaseId)

  if (existing) {
    const publicKeyJwk = await crypto.subtle.exportKey(
      'jwk',
      await crypto.subtle.importKey(
        'jwk',
        existing.publicKeyJwk,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        true,
        ['encrypt']
      )
    )

    return {
      publicKeyBase64: toBase64(publicKeyJwk),
    }
  }

  // Generate new keypair
  const keyPair = await generateKeypair()

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(
    {
      privateKeyJwk,
      publicKeyJwk,
    },
    purchaseId
  )

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })

  return {
    publicKeyBase64: toBase64(publicKeyJwk),
  }
}

/* ------------------------------------------------ */
/* 🔑 Load Private Key */
/* ------------------------------------------------ */

async function loadBuyerPrivateKeySafe(purchaseId: string): Promise<{
  privateKeyJwk: JsonWebKey
  publicKeyJwk: JsonWebKey
} | null> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const request = tx.objectStore(STORE_NAME).get(purchaseId)

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close()
      resolve(request.result || null)
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

/**
 * Returns usable CryptoKey for decryption
 */
export async function loadBuyerPrivateKey(
  purchaseId: string
): Promise<CryptoKey> {
  const stored = await loadBuyerPrivateKeySafe(purchaseId)

  if (!stored) {
    throw new Error('Private key not found for this purchase')
  }

  return crypto.subtle.importKey(
    'jwk',
    stored.privateKeyJwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  )
}

/* ------------------------------------------------ */
/* 🧹 Delete Keys */
/* ------------------------------------------------ */

export async function deleteBuyerKeypair(purchaseId: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(purchaseId)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}
