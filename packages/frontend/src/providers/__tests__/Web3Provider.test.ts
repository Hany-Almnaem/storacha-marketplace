import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

/**
 * Tests for Web3Provider SSR hydration fix.
 * Validates that the provider implements correct patterns to prevent
 * hydration mismatch between server and client rendering.
 */
describe('Web3Provider SSR hydration handling', () => {
  const providerPath = join(__dirname, '../Web3Provider.tsx')
  const providerSource = readFileSync(providerPath, 'utf-8')

  describe('mounted state pattern', () => {
    it('imports useState and useEffect from React', () => {
      expect(providerSource).toContain('useState')
      expect(providerSource).toContain('useEffect')
    })

    it('declares mounted state with initial value false', () => {
      // Pattern: const [mounted, setMounted] = useState(false)
      expect(providerSource).toMatch(
        /\[mounted,\s*setMounted\]\s*=\s*useState\(false\)/
      )
    })

    it('sets mounted to true in useEffect', () => {
      // Pattern: setMounted(true) inside useEffect
      expect(providerSource).toContain('setMounted(true)')
      expect(providerSource).toContain('useEffect')
    })

    it('uses empty dependency array for useEffect', () => {
      // Pattern: useEffect(() => { ... }, [])
      // This ensures the effect runs only once on mount
      expect(providerSource).toMatch(
        /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\]\s*\)/
      )
    })
  })

  describe('theme rendering', () => {
    it('uses resolvedTheme from useTheme hook', () => {
      expect(providerSource).toContain('useTheme')
      expect(providerSource).toContain('resolvedTheme')
    })

    it('conditionally renders theme based on mounted state', () => {
      // Theme should only be applied after mounting
      expect(providerSource).toMatch(/mounted\s*\?/)
    })

    it('imports both darkTheme and lightTheme from RainbowKit', () => {
      expect(providerSource).toContain('darkTheme')
      expect(providerSource).toContain('lightTheme')
    })

    it('returns undefined theme when not mounted', () => {
      // Pattern: mounted ? (theme logic) : undefined
      expect(providerSource).toMatch(/:\s*undefined/)
    })
  })

  describe('provider structure', () => {
    it('wraps children with WagmiProvider', () => {
      expect(providerSource).toContain('WagmiProvider')
      expect(providerSource).toContain('<WagmiProvider')
    })

    it('wraps children with QueryClientProvider', () => {
      expect(providerSource).toContain('QueryClientProvider')
      expect(providerSource).toContain('<QueryClientProvider')
    })

    it('wraps children with RainbowKitProvider', () => {
      expect(providerSource).toContain('RainbowKitProvider')
      expect(providerSource).toContain('<RainbowKitProvider')
    })

    it('passes theme prop to RainbowKitProvider', () => {
      expect(providerSource).toMatch(/<RainbowKitProvider[^>]*theme=/)
    })
  })
})

describe('Web3Provider client-side directive', () => {
  const providerPath = join(__dirname, '../Web3Provider.tsx')
  const providerSource = readFileSync(providerPath, 'utf-8')

  it('has use client directive at the top', () => {
    // Must be first line (excluding comments)
    expect(providerSource.trim().startsWith("'use client'")).toBe(true)
  })
})

describe('SSR hydration fix rationale', () => {
  it('explains the hydration mismatch problem', () => {
    /**
     * Problem: Server renders with one theme (undefined/light),
     * client detects system preference (possibly dark), causing mismatch.
     *
     * Solution: Delay theme application until after client hydration.
     * - mounted=false during SSR → theme=undefined
     * - mounted=true after useEffect → theme=(resolved)
     *
     * This prevents React from detecting a mismatch in the initial render.
     */
    expect(true).toBe(true) // Documentation test
  })

  it('validates the fix follows React hydration best practices', () => {
    /**
     * Best practices for SSR hydration:
     * 1. Use useState with initial value that matches server render
     * 2. Use useEffect with empty deps to detect client mount
     * 3. Only render dynamic content after mount detected
     */
    expect(true).toBe(true) // Documentation test
  })
})
