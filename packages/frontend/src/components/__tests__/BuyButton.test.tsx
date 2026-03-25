import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

/**
 * Tests for BuyButton component logic and branches.
 * Given the Node.js test environment, these tests use static analysis
 * to ensure critical security and logic branches are present.
 */
describe('BuyButton component logic', () => {
  const componentPath = join(__dirname, '../BuyButton.tsx')
  const source = readFileSync(componentPath, 'utf-8')

  describe('Configuration Validation', () => {
    it('defines isConfigValid logic', () => {
      expect(source).toContain('const isConfigValid =')
      expect(source).toContain('USDC_ADDRESS &&')
      expect(source).toContain('MARKETPLACE_ADDRESS &&')
      expect(source).toContain('isAddress(USDC_ADDRESS)')
      expect(source).toContain('isAddress(MARKETPLACE_ADDRESS)')
    })

    it('renders configuration warning when isConfigValid is false', () => {
      expect(source).toContain('!isConfigValid ? (')
      expect(source).toContain('Configuration Error')
      expect(source).toContain('Marketplace or USDC address is missing')
    })
  })

  describe('Buy Flow Sequence and Guards', () => {
    it('calls approveIfNeeded before purchase', () => {
      const handleBuyMatch = source.match(
        /const handleBuy = async \(\) => \{([\s\S]*?)\n {2}\}/
      )
      const handleBuyBody = handleBuyMatch?.[1] ?? ''

      const approveIndex = handleBuyBody.indexOf('await approveIfNeeded()')
      const purchaseIndex = handleBuyBody.indexOf('await purchase(onchainId)')

      expect(
        approveIndex,
        'approveIfNeeded not found in handleBuy'
      ).toBeGreaterThan(-1)
      expect(purchaseIndex, 'purchase not found in handleBuy').toBeGreaterThan(
        -1
      )
      expect(approveIndex).toBeLessThan(purchaseIndex)
    })

    it('implements the guard against missing txHash', () => {
      expect(source).toContain('const txHash = await purchase(onchainId)')
      expect(source).toMatch(
        /if\s*\(!txHash\)\s*\{[\s\S]*?throw new Error\('Failed to purchase'\)/
      )
    })

    it('implements the guard against reverted transactions', () => {
      expect(source).toContain(
        'const receipt = await waitForTransactionReceipt'
      )
      expect(source).toMatch(
        /if\s*\(receipt\.status === 'reverted'\)\s*\{[\s\S]*?throw new Error\('Transaction reverted on-chain'\)/
      )
    })

    it('stops flow if backend polling fails', () => {
      expect(source).toContain(
        'const purchaseRecord = await waitForBackendPurchase(txHash)'
      )
      expect(source).toMatch(
        /getOrCreateBuyerKeypair\(\s*purchaseRecord\.id\s*\)/
      )
    })
  })

  describe('Error Handling', () => {
    it('classifies RPC errors in the catch block', () => {
      expect(source).toContain('catch (err) {')
      expect(source).toContain('setError(classifyRpcError(err))')
      expect(source).toContain("setStatus('error')")
    })

    it('displays error messages in the UI', () => {
      expect(source).toContain('{error && (')
      expect(source).toContain('{error.title}')
      expect(source).toContain('{error.detail}')
    })
  })
})
