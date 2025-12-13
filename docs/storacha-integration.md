# Storacha Integration - Production Guide

**Status:** ✅ Complete (Issue #3)  
**Verified:** December 1, 2024  
**Stack:** Next.js 14, @storacha/client 1.8.20, Node 22+

---

## Core Components

1. **`src/lib/encryption.ts`** - AES-256-GCM encryption via Web Crypto API
2. **`src/lib/storacha.ts`** - Storacha client with authentication & space
   management
3. **`src/lib/envelope.ts`** - Encryption metadata per spec Section 3.3

---

## Verified Upload/Download Flow

```typescript
// 1. Initialize & authenticate
const client = await initializeClient(email)
// ⚠️ Email verification required - user clicks link

// 2. Create/get space (save Space DID!)
const space = await getOrCreateSpace(client, 'space-name')

// 3. Encrypt file
const key = await generateKey()
const encrypted = await encryptFile(file, key)

// 4. Upload to Storacha
const cid = await uploadBlob(client, new Uint8Array(encrypted))

// 5. Retrieve from gateway
const response = await fetch(`https://w3s.link/ipfs/${cid}`)
const downloaded = await response.arrayBuffer()

// 6. Decrypt & verify
const decrypted = await decryptFile(downloaded, key)
const hash = await sha256(decrypted)
// Verify hash === envelope.plaintext_sha256
```

---

## Critical Requirements

### ✅ What Works

- **Browser environment only** - @storacha/client works in Next.js, NOT Node.js
  CLI
- **Email auth** - Manual verification required (30-60s)
- **Delegation claiming** - Must call `client.capability.access.claim()` after
  login
- **Space provisioning** - Pass `{ account }` when creating space
- **Gateway propagation** - 5-30s delay after upload

### Production Implementation (Issue #9)

```typescript
// Upload component flow
async function handleUpload(file: File) {
  // 1. Encrypt
  const key = await generateKey()
  const encrypted = await encryptFile(file, key)

  // 2. Generate envelope
  const envelope = await generateEnvelope(file, await file.arrayBuffer())

  // 3. Upload
  const client = await initializeClient(email)
  const space = await getOrCreateSpace(client, 'seller-space')
  const cid = await uploadBlob(client, new Uint8Array(encrypted))

  // 4. Export key for backup
  const exportedKey = await crypto.subtle.exportKey('jwk', key)

  return { cid, envelope, keyBackup: JSON.stringify(exportedKey) }
}
```

### Critical UX Requirements

1. **Key backup mandatory** - Block listing until backup downloaded
2. **Email verification modal** - Show "Check your email..." message
3. **Upload progress** - Use indeterminate spinner (no progress API)
4. **Error retry** - Gateway fetches need exponential backoff
5. **File size limit** - Enforce 100MB max for MVP

---

## Common Issues & Solutions

| Error                   | Solution                                           |
| ----------------------- | -------------------------------------------------- |
| "proofs is undefined"   | Add `client.capability.access.claim()` after login |
| "failed space/blob/add" | Pass `{ account }` when creating space             |
| "Space not found"       | Save STORACHA_SPACE_DID in `.env`            |
| Gateway 404             | Wait 5-30s for propagation, then retry             |

---

## Environment Setup

```bash
# .env
STORACHA_EMAIL=seller@example.com
STORACHA_SPACE_DID=did:key:z6Mk...  # Save after first run
```

---

## Testing

- **Unit tests:** 37 passing (encryption, envelope, storacha)
- **Browser E2E:** Navigate to `/test-storacha` for full flow verification

---

## Performance (Measured)

- **Encryption:** ~5ms (10KB), ~5s (100MB)
- **Upload:** ~5-10s (network-dependent)
- **Download:** ~3s (w3s.link gateway)
- **Decryption:** ~2ms (10KB), ~2s (100MB)

**Bottleneck:** Network latency, not encryption.
