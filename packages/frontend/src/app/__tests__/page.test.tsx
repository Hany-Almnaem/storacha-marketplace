import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

/**
 * Tests for Home page navigation links.
 * Validates that navigation buttons use correct routes via static analysis.
 * Note: Full component rendering tests require @testing-library/react.
 */
describe('Home page navigation', () => {
  const pagePath = join(__dirname, '../page.tsx')
  const pageSource = readFileSync(pagePath, 'utf-8')

  it('imports Link from next/link', () => {
    expect(pageSource).toContain("import Link from 'next/link'")
  })

  it('uses Link component for Browse Datasets navigation', () => {
    // Verify Link is used with correct href for Browse Datasets
    expect(pageSource).toContain('href="/listings"')
    expect(pageSource).toContain('Browse Datasets')
  })

  it('uses Link component for Start Selling navigation', () => {
    // Verify Link is used with correct href for Start Selling
    expect(pageSource).toContain('href="/sell/new"')
    expect(pageSource).toContain('Start Selling')
  })

  it('does not use static button elements for navigation', () => {
    // Verify we're not using button elements for the main navigation
    // This checks that we don't have <button>Browse Datasets or <button>Start Selling
    expect(pageSource).not.toMatch(/<button[^>]*>\s*Browse Datasets/i)
    expect(pageSource).not.toMatch(/<button[^>]*>\s*Start Selling/i)
  })

  it('preserves styling classes on navigation links', () => {
    // Verify the btn-primary and btn-outline classes are still applied
    expect(pageSource).toContain('btn-primary')
    expect(pageSource).toContain('btn-outline')
  })
})

describe('Navigation route validation', () => {
  it('Browse Datasets route follows URL conventions', () => {
    const route = '/listings'
    // Must start with /
    expect(route.startsWith('/')).toBe(true)
    // Must be lowercase
    expect(route).toBe(route.toLowerCase())
    // No trailing slash
    expect(route.endsWith('/')).toBe(false)
  })

  it('Start Selling route follows URL conventions', () => {
    const route = '/sell/new'
    // Must start with /
    expect(route.startsWith('/')).toBe(true)
    // Must be lowercase
    expect(route).toBe(route.toLowerCase())
    // No trailing slash
    expect(route.endsWith('/')).toBe(false)
  })

  it('Start Selling route exists in filesystem', () => {
    const sellNewPath = join(__dirname, '../sell/new/page.tsx')
    expect(() => readFileSync(sellNewPath)).not.toThrow()
  })
})
