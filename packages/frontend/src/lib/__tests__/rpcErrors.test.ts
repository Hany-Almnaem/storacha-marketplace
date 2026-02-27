import { describe, it, expect } from 'vitest'

import { classifyRpcError } from '../rpcErrors'

describe('classifyRpcError', () => {
  describe('user rejection', () => {
    it('detects MetaMask user rejection', () => {
      const result = classifyRpcError(new Error('User rejected the request.'))
      expect(result.title).toBe('Transaction cancelled')
      expect(result.retryable).toBe(true)
    })

    it('detects "User denied transaction"', () => {
      const result = classifyRpcError(
        new Error('User denied transaction signature')
      )
      expect(result.title).toBe('Transaction cancelled')
    })
  })

  describe('gas limit exceeded (contract revert during estimation)', () => {
    it('classifies the exact error the user reported', () => {
      const rawError = new Error(
        'The contract function "purchaseAccess" reverted with the following reason: ' +
          'exceeds maximum per-transaction gas limit: transaction gas 131250000, limit 25000000 ' +
          'Contract Call: address: 0xce383BfDF637772a9C56EEa033B7Eb9129A19999 ' +
          'function: purchaseAccess(uint256 _listingId) args: (18) ' +
          'sender: 0x5D4477D1dF38855C68BF204e4992E00519dA6EBd'
      )
      const result = classifyRpcError(rawError)
      expect(result.title).toBe('Transaction would fail')
      expect(result.detail).toContain('contract rejected')
      expect(result.suggestion).toContain('listing may no longer exist')
      expect(result.retryable).toBe(true)
    })

    it('handles gas limit error without a revert reason', () => {
      const result = classifyRpcError(
        new Error('exceeds maximum per-transaction gas limit')
      )
      expect(result.title).toBe('Transaction would fail')
      expect(result.detail).toContain('simulation')
    })
  })

  describe('insufficient funds', () => {
    it('detects insufficient ETH for gas', () => {
      const result = classifyRpcError(
        new Error('insufficient funds for gas * price + value')
      )
      expect(result.title).toBe('Insufficient ETH for gas')
      expect(result.suggestion).toContain('Add ETH')
    })

    it('detects "sender doesn\'t have enough funds"', () => {
      const result = classifyRpcError(
        new Error("sender doesn't have enough funds to send tx")
      )
      expect(result.title).toBe('Insufficient ETH for gas')
    })
  })

  describe('insufficient USDC', () => {
    it('detects insufficient allowance', () => {
      const result = classifyRpcError(new Error('insufficient allowance'))
      expect(result.title).toBe('Insufficient USDC')
    })

    it('detects ERC20 transfer exceeds balance', () => {
      const result = classifyRpcError(
        new Error('ERC20: transfer amount exceeds balance')
      )
      expect(result.title).toBe('Insufficient USDC')
    })
  })

  describe('nonce / tx conflict', () => {
    it('detects nonce too low', () => {
      const result = classifyRpcError(new Error('nonce too low'))
      expect(result.title).toBe('Transaction conflict')
      expect(result.suggestion).toContain('refresh')
    })

    it('detects replacement transaction underpriced', () => {
      const result = classifyRpcError(
        new Error('replacement transaction underpriced')
      )
      expect(result.title).toBe('Transaction conflict')
    })
  })

  describe('network / chain errors', () => {
    it('detects wrong network', () => {
      const result = classifyRpcError(new Error('could not detect network'))
      expect(result.title).toBe('Wrong network')
      expect(result.suggestion).toContain('Base Sepolia')
    })

    it('detects chain mismatch', () => {
      const result = classifyRpcError(new Error('chain mismatch'))
      expect(result.title).toBe('Wrong network')
    })
  })

  describe('network timeouts', () => {
    it('detects timeout', () => {
      const result = classifyRpcError(
        new Error('request timeout after 30000ms')
      )
      expect(result.title).toBe('Network error')
      expect(result.retryable).toBe(true)
    })

    it('detects fetch failed', () => {
      const result = classifyRpcError(new Error('fetch failed'))
      expect(result.title).toBe('Network error')
    })
  })

  describe('rate limiting', () => {
    it('detects rate limit', () => {
      const result = classifyRpcError(new Error('rate limit exceeded'))
      expect(result.title).toBe('Rate limited')
      expect(result.suggestion).toContain('Wait')
    })

    it('detects 429 status', () => {
      const result = classifyRpcError(new Error('429 Too Many Requests'))
      expect(result.title).toBe('Rate limited')
    })
  })

  describe('backend indexing delay', () => {
    it('detects indexing timeout', () => {
      const result = classifyRpcError(
        new Error('Purchase not indexed by backend yet')
      )
      expect(result.title).toBe('Indexing delay')
      expect(result.detail).toContain('succeeded')
      expect(result.retryable).toBe(false)
    })
  })

  describe('generic contract revert', () => {
    it('detects execution reverted with reason', () => {
      const result = classifyRpcError(
        new Error('execution reverted: Listing does not exist')
      )
      expect(result.title).toBe('Contract error')
      expect(result.suggestion).toContain('listing')
    })

    it('detects VM exception', () => {
      const result = classifyRpcError(
        new Error('VM Exception while processing transaction: revert')
      )
      expect(result.title).toBe('Contract error')
    })
  })

  describe('fallback', () => {
    it('returns generic error for unknown messages', () => {
      const result = classifyRpcError(new Error('Something weird happened'))
      expect(result.title).toBe('Purchase failed')
      expect(result.detail).toBe('Something weird happened')
      expect(result.retryable).toBe(true)
    })

    it('truncates very long error messages', () => {
      const longMsg = 'A'.repeat(500)
      const result = classifyRpcError(new Error(longMsg))
      expect(result.detail.length).toBeLessThanOrEqual(201)
      expect(result.detail).toContain('…')
    })

    it('handles non-Error values', () => {
      const result = classifyRpcError('string error')
      expect(result.title).toBe('Purchase failed')
      expect(result.detail).toBe('string error')
    })

    it('handles null/undefined', () => {
      const result = classifyRpcError(null)
      expect(result.title).toBe('Purchase failed')
      expect(result.detail).toBe('Unknown error')
    })
  })
})
