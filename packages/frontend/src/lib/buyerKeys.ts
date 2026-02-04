const DB_NAME = 'buyer-keys-db'
const STORE_NAME = 'keys'
const DB_VERSION = 1

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

export async function generateBuyerKeypair(purchaseId: string) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  )

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(keyPair.privateKey, purchaseId)

  return {
    publicKeyBase64: btoa(JSON.stringify(publicKeyJwk)),
  }
}

export async function loadBuyerPrivateKey(purchaseId: string) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const req = tx.objectStore(STORE_NAME).get(purchaseId)

  return new Promise<CryptoKey>((resolve, reject) => {
    req.onsuccess = () => {
      if (!req.result) {
        reject(new Error('Private key not found'))
      } else {
        resolve(req.result)
      }
    }
    req.onerror = () => reject(req.error)
  })
}
