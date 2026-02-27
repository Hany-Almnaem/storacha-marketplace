import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

describe('Purchases page identity and ordering', () => {
  const pagePath = join(__dirname, '../purchases/page.tsx')
  const pageSource = readFileSync(pagePath, 'utf-8')

  it('Purchase interface includes listing.id for row identity', () => {
    expect(pageSource).toContain('id: string\n    title: string')
  })

  it('Purchase interface includes listing.sellerAddress', () => {
    expect(pageSource).toContain('sellerAddress: string')
  })

  it('Purchase interface includes txHash', () => {
    expect(pageSource).toMatch(/txHash:\s*string/)
  })

  it('displays purchase ID in the row', () => {
    expect(pageSource).toContain('ID: {shortValue(purchase.id)}')
  })

  it('displays seller address in the row', () => {
    expect(pageSource).toContain(
      'Seller: {shortValue(purchase.listing.sellerAddress)}'
    )
  })

  it('displays tx hash in the row', () => {
    expect(pageSource).toContain('Tx: {shortValue(purchase.txHash')
  })

  it('sorts purchases newest first', () => {
    expect(pageSource).toContain('b.createdAt')
    expect(pageSource).toContain('a.createdAt')
    expect(pageSource).toMatch(
      /new Date\(b\.createdAt\).*-.*new Date\(a\.createdAt\)/s
    )
  })

  it('includes shortValue truncation helper', () => {
    expect(pageSource).toContain('function shortValue(')
  })

  it('shows full value on hover via title attribute', () => {
    expect(pageSource).toContain('title={purchase.id}')
    expect(pageSource).toContain('title={purchase.listing.sellerAddress}')
    expect(pageSource).toContain('title={purchase.txHash}')
  })
})
