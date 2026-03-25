import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { clearAuthCache, getCachedAuthHeader } from './authCache'

const TTL_MS = 4 * 60 * 1000

describe('authCache', () => {
  let now = Date.now()

  beforeEach(() => {
    clearAuthCache()
    vi.restoreAllMocks()

    now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearAuthCache()
  })

  it('returns cached header on second call within TTL', async () => {
    const buildFn = vi.fn(async () => 'header-1')
    const address = '0xabc0000000000000000000000000000000000abc'

    const header1 = await getCachedAuthHeader(address, 'general', buildFn)

    now += TTL_MS - 1
    const header2 = await getCachedAuthHeader(address, 'general', buildFn)

    expect(buildFn).toHaveBeenCalledTimes(1)
    expect(header2).toBe(header1)
  })

  it('calls buildFn again after TTL expires', async () => {
    let callCount = 0
    const buildFn = vi.fn(async () => `header-${callCount++}`)
    const address = '0xdef0000000000000000000000000000000000def'

    await getCachedAuthHeader(address, 'general', buildFn)

    now += TTL_MS + 1
    await getCachedAuthHeader(address, 'general', buildFn)

    expect(buildFn).toHaveBeenCalledTimes(2)
  })

  it('clearAuthCache(address) clears only that address', async () => {
    const address1 = '0xaaa0000000000000000000000000000000000aaa'
    const address2 = '0xbbb0000000000000000000000000000000000bbb'

    const build1 = vi.fn(async () => 'header-1')
    const build2 = vi.fn(async () => 'header-2')

    const header1 = await getCachedAuthHeader(address1, 'general', build1)
    const header2 = await getCachedAuthHeader(address2, 'general', build2)

    clearAuthCache(address1)

    const build1b = vi.fn(async () => 'header-1b')
    const build2b = vi.fn(async () => 'header-2b')

    const afterClearHeader1 = await getCachedAuthHeader(
      address1,
      'general',
      build1b
    )
    const afterClearHeader2 = await getCachedAuthHeader(
      address2,
      'general',
      build2b
    )

    expect(build1b).toHaveBeenCalledTimes(1)
    expect(build2b).toHaveBeenCalledTimes(0)
    expect(afterClearHeader1).toBe('header-1b')
    expect(afterClearHeader2).toBe(header2)
  })

  it('clearAuthCache() clears everything', async () => {
    const address1 = '0xaaa1111111111111111111111111111111111aaa'
    const address2 = '0xbbb2222222222222222222222222222222222bbb'

    const build1 = vi.fn(async () => 'header-1')
    const build2 = vi.fn(async () => 'header-2')

    await getCachedAuthHeader(address1, 'general', build1)
    await getCachedAuthHeader(address2, 'general', build2)

    clearAuthCache()

    const build1b = vi.fn(async () => 'header-1b')
    const build2b = vi.fn(async () => 'header-2b')

    await getCachedAuthHeader(address1, 'general', build1b)
    await getCachedAuthHeader(address2, 'general', build2b)

    expect(build1b).toHaveBeenCalledTimes(1)
    expect(build2b).toHaveBeenCalledTimes(1)
  })

  it('caches general and listing separately', async () => {
    const address = '0xccc3333333333333333333333333333333333ccc'

    const buildGeneral1 = vi.fn(async () => 'general-1')
    const buildListing1 = vi.fn(async () => 'listing-1')

    const general1 = await getCachedAuthHeader(
      address,
      'general',
      buildGeneral1
    )
    const listing1 = await getCachedAuthHeader(
      address,
      'listing',
      buildListing1
    )

    now += 10_000

    const buildGeneral2 = vi.fn(async () => 'general-2')
    const buildListing2 = vi.fn(async () => 'listing-2')

    const general2 = await getCachedAuthHeader(
      address,
      'general',
      buildGeneral2
    )
    const listing2 = await getCachedAuthHeader(
      address,
      'listing',
      buildListing2
    )

    expect(buildGeneral2).toHaveBeenCalledTimes(0)
    expect(buildListing2).toHaveBeenCalledTimes(0)
    expect(general2).toBe(general1)
    expect(listing2).toBe(listing1)
  })

  it('evicts cache when buildFn rejects so the next call retries', async () => {
    const buildReject = vi.fn(() =>
      Promise.reject(new Error('User rejected the request'))
    )
    const buildOk = vi.fn(async () => 'header-after-retry')
    const address = '0xddd4444444444444444444444444444444444ddd'

    await expect(
      getCachedAuthHeader(address, 'general', buildReject)
    ).rejects.toThrow('User rejected the request')
    expect(buildReject).toHaveBeenCalledTimes(1)

    const header = await getCachedAuthHeader(address, 'general', buildOk)
    expect(buildOk).toHaveBeenCalledTimes(1)
    expect(header).toBe('header-after-retry')
  })

  it('deduplicates concurrent calls: single buildFn, same resolved header', async () => {
    let resolveHeader!: (value: string) => void
    const deferred = new Promise<string>((resolve) => {
      resolveHeader = resolve
    })
    const buildFn = vi.fn(() => deferred)
    const address = '0xeee5555555555555555555555555555555555eee'

    const first = getCachedAuthHeader(address, 'general', buildFn)
    const second = getCachedAuthHeader(address, 'general', buildFn)

    expect(buildFn).toHaveBeenCalledTimes(1)

    resolveHeader('shared-header')
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe('shared-header')
    expect(b).toBe('shared-header')
  })

  // Intentionally out of scope:
  // bind-key signatures are excluded from this cache by design.
})
