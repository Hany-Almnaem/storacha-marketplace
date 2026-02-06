import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { ApiErrorResponse } from '../api-error'
import { formatApiError, logValidationError } from '../api-error'

describe('api-error utilities', () => {
  describe('formatApiError', () => {
    it('returns error message when no details present', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
      }
      expect(formatApiError(response)).toBe('Validation failed')
    })

    it('returns default message when error is empty and no details', () => {
      const response: ApiErrorResponse = {
        error: '',
      }
      expect(formatApiError(response)).toBe('An unknown error occurred')
    })

    it('formats single validation error detail', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [{ path: ['dataCid'], message: 'Invalid CID format' }],
      }
      expect(formatApiError(response)).toBe(
        'Validation failed: dataCid: Invalid CID format'
      )
    })

    it('formats multiple validation error details', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [
          { path: ['dataCid'], message: 'Invalid CID format' },
          { path: ['price'], message: 'Must be positive' },
        ],
      }
      expect(formatApiError(response)).toBe(
        'Validation failed: dataCid: Invalid CID format, price: Must be positive'
      )
    })

    it('handles nested field paths', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [
          {
            path: ['envelope', 'keyInfo', 'algorithm'],
            message: 'Unknown algorithm',
          },
        ],
      }
      expect(formatApiError(response)).toBe(
        'Validation failed: envelope.keyInfo.algorithm: Unknown algorithm'
      )
    })

    it('handles empty details array', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [],
      }
      expect(formatApiError(response)).toBe('Validation failed')
    })

    it('handles empty path array', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [{ path: [], message: 'Root level error' }],
      }
      expect(formatApiError(response)).toBe(
        'Validation failed: : Root level error'
      )
    })
  })

  describe('logValidationError', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('logs details when present', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [{ path: ['dataCid'], message: 'Invalid CID format' }],
      }
      logValidationError(response)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Validation error details:',
        JSON.stringify(response.details, null, 2)
      )
    })

    it('does not log when no details', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
      }
      logValidationError(response)
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('does not log when details array is empty', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [],
      }
      logValidationError(response)
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('logs multiple validation details correctly', () => {
      const response: ApiErrorResponse = {
        error: 'Validation failed',
        details: [
          { path: ['dataCid'], message: 'Invalid CID format' },
          { path: ['envelopeCid'], message: 'Required' },
          { path: ['priceUsdc'], message: 'Must be positive' },
        ],
      }
      logValidationError(response)
      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedJson = consoleSpy.mock.calls[0][1]
      const parsed = JSON.parse(loggedJson)
      expect(parsed).toHaveLength(3)
      expect(parsed[0].path).toEqual(['dataCid'])
    })
  })
})

describe('integration: API error formatting for common backend scenarios', () => {
  it('formats CID validation error correctly', () => {
    const response: ApiErrorResponse = {
      error: 'Validation failed',
      details: [
        {
          path: ['dataCid'],
          message: 'Invalid CID format. Expected format: baf[a-z2-7]{50,}',
        },
      ],
    }
    const formatted = formatApiError(response)
    expect(formatted).toContain('dataCid')
    expect(formatted).toContain('Invalid CID format')
  })

  it('formats price validation error correctly', () => {
    const response: ApiErrorResponse = {
      error: 'Validation failed',
      details: [
        {
          path: ['priceUsdc'],
          message: 'Amount must be positive',
        },
      ],
    }
    const formatted = formatApiError(response)
    expect(formatted).toContain('priceUsdc')
    expect(formatted).toContain('Amount must be positive')
  })

  it('formats missing required field error correctly', () => {
    const response: ApiErrorResponse = {
      error: 'Validation failed',
      details: [
        {
          path: ['envelopeHash'],
          message: 'Required',
        },
      ],
    }
    const formatted = formatApiError(response)
    expect(formatted).toContain('envelopeHash')
    expect(formatted).toContain('Required')
  })
})
