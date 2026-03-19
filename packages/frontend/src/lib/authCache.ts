// bind-key signatures are intentionally excluded from this cache.
// bind-key must remain an explicit per-action signature so the
// user consciously approves each key binding. Do not add
// bind-key flows here.

type AuthCacheEntry = {
  cachedAt: number
  value: Promise<string>
}

const TTL_MS = 4 * 60 * 1000

const authHeaderCache = new Map<string, AuthCacheEntry>()

function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

function buildCacheKey(address: string, purpose: string): string {
  const normalizedPurpose = purpose.toLowerCase()

  if (normalizedPurpose !== 'general' && normalizedPurpose !== 'listing') {
    throw new Error(`Invalid auth purpose: "${purpose}".`)
  }

  return `${normalizeAddress(address)}::${normalizedPurpose}`
}

export async function getCachedAuthHeader(
  address: string,
  purpose: string,
  buildFn: () => Promise<string>
): Promise<string> {
  const cacheKey = buildCacheKey(address, purpose)
  const now = Date.now()

  const existing = authHeaderCache.get(cacheKey)
  if (existing && now - existing.cachedAt < TTL_MS) {
    return existing.value
  }

  const cachedAt = now
  const value = buildFn()

  authHeaderCache.set(cacheKey, { cachedAt, value })

  // If building fails, remove the cache entry so the next call can retry.
  value.catch(() => {
    const current = authHeaderCache.get(cacheKey)
    if (current?.value === value) {
      authHeaderCache.delete(cacheKey)
    }
  })

  return value
}

export function clearAuthCache(address?: string): void {
  if (!address) {
    authHeaderCache.clear()
    return
  }

  const prefix = `${normalizeAddress(address)}::`
  for (const key of authHeaderCache.keys()) {
    if (key.startsWith(prefix)) {
      authHeaderCache.delete(key)
    }
  }
}
