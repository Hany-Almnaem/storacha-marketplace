import { describe, it, expect } from 'vitest'

import {
  validateTitle,
  validateDescription,
  validatePrice,
  validateListingForm,
  getCharCountStatus,
} from '../form-validation'

describe('form-validation utilities', () => {
  describe('validateTitle', () => {
    it('returns error for empty title', () => {
      expect(validateTitle('')).toEqual({
        valid: false,
        error: 'Title is required',
      })
      expect(validateTitle('   ')).toEqual({
        valid: false,
        error: 'Title is required',
      })
    })

    it('returns error for title less than 3 characters', () => {
      expect(validateTitle('ab')).toEqual({
        valid: false,
        error: 'Title must be at least 3 characters',
      })
    })

    it('returns error for title more than 100 characters', () => {
      const longTitle = 'a'.repeat(101)
      expect(validateTitle(longTitle)).toEqual({
        valid: false,
        error: 'Title must be at most 100 characters',
      })
    })

    it('returns valid for title with 3+ characters', () => {
      expect(validateTitle('abc')).toEqual({ valid: true })
      expect(validateTitle('Valid Dataset Title')).toEqual({ valid: true })
    })

    it('trims whitespace when validating', () => {
      expect(validateTitle('  ab  ')).toEqual({
        valid: false,
        error: 'Title must be at least 3 characters',
      })
      expect(validateTitle('  abc  ')).toEqual({ valid: true })
    })
  })

  describe('validateDescription', () => {
    it('returns error for empty description', () => {
      expect(validateDescription('')).toEqual({
        valid: false,
        error: 'Description is required',
      })
    })

    it('returns error for description less than 10 characters', () => {
      expect(validateDescription('Short')).toEqual({
        valid: false,
        error: 'Description must be at least 10 characters',
      })
    })

    it('returns error for description more than 5000 characters', () => {
      const longDescription = 'a'.repeat(5001)
      expect(validateDescription(longDescription)).toEqual({
        valid: false,
        error: 'Description must be at most 5000 characters',
      })
    })

    it('returns valid for description with 10+ characters', () => {
      expect(validateDescription('0123456789')).toEqual({ valid: true })
      expect(
        validateDescription('This is a valid description for a dataset.')
      ).toEqual({
        valid: true,
      })
    })
  })

  describe('validatePrice', () => {
    it('returns error for empty price', () => {
      expect(validatePrice('')).toEqual({
        valid: false,
        error: 'Price is required',
      })
    })

    it('returns error for non-numeric price', () => {
      expect(validatePrice('abc')).toEqual({
        valid: false,
        error: 'Price must be a positive number',
      })
    })

    it('returns error for zero price', () => {
      expect(validatePrice('0')).toEqual({
        valid: false,
        error: 'Price must be a positive number',
      })
    })

    it('returns error for negative price', () => {
      expect(validatePrice('-10')).toEqual({
        valid: false,
        error: 'Price must be a positive number',
      })
    })

    it('returns error for more than 6 decimal places', () => {
      expect(validatePrice('10.1234567')).toEqual({
        valid: false,
        error: 'Price must have at most 6 decimal places',
      })
    })

    it('returns valid for positive prices with up to 6 decimals', () => {
      expect(validatePrice('10')).toEqual({ valid: true })
      expect(validatePrice('10.50')).toEqual({ valid: true })
      expect(validatePrice('10.123456')).toEqual({ valid: true })
      expect(validatePrice('0.01')).toEqual({ valid: true })
    })
  })

  describe('validateListingForm', () => {
    it('returns all errors for empty form', () => {
      const result = validateListingForm('', '', '')
      expect(result.valid).toBe(false)
      expect(result.errors.title).toBeDefined()
      expect(result.errors.description).toBeDefined()
      expect(result.errors.price).toBeDefined()
    })

    it('returns valid for complete valid form', () => {
      const result = validateListingForm(
        'Valid Title',
        'This is a valid description with more than 10 characters',
        '25.00'
      )
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual({})
    })

    it('returns partial errors for partially invalid form', () => {
      const result = validateListingForm(
        'ab',
        'Valid description here',
        '10.00'
      )
      expect(result.valid).toBe(false)
      expect(result.errors.title).toBeDefined()
      expect(result.errors.description).toBeUndefined()
      expect(result.errors.price).toBeUndefined()
    })
  })

  describe('getCharCountStatus', () => {
    it('returns amber for count below minimum', () => {
      const result = getCharCountStatus(5, 10, 100)
      expect(result.text).toBe('5/10 min')
      expect(result.className).toBe('text-amber-600')
    })

    it('returns red for count above maximum', () => {
      const result = getCharCountStatus(105, 10, 100)
      expect(result.text).toBe('105/100 max')
      expect(result.className).toBe('text-red-600')
    })

    it('returns gray for count within range', () => {
      const result = getCharCountStatus(50, 10, 100)
      expect(result.text).toBe('50/100')
      expect(result.className).toBe('text-gray-500')
    })

    it('returns gray for count at exactly minimum', () => {
      const result = getCharCountStatus(10, 10, 100)
      expect(result.text).toBe('10/100')
      expect(result.className).toBe('text-gray-500')
    })

    it('returns gray for count at exactly maximum', () => {
      const result = getCharCountStatus(100, 10, 100)
      expect(result.text).toBe('100/100')
      expect(result.className).toBe('text-gray-500')
    })
  })
})

describe('integration: form validation matches backend requirements', () => {
  it('title validation matches backend CreateListingSchema', () => {
    // Backend: min 3, max 100
    expect(validateTitle('ab').valid).toBe(false) // 2 chars - fail
    expect(validateTitle('abc').valid).toBe(true) // 3 chars - pass
    expect(validateTitle('a'.repeat(100)).valid).toBe(true) // 100 chars - pass
    expect(validateTitle('a'.repeat(101)).valid).toBe(false) // 101 chars - fail
  })

  it('description validation matches backend CreateListingSchema', () => {
    // Backend: min 10, max 5000
    expect(validateDescription('123456789').valid).toBe(false) // 9 chars - fail
    expect(validateDescription('1234567890').valid).toBe(true) // 10 chars - pass
    expect(validateDescription('a'.repeat(5000)).valid).toBe(true) // 5000 chars - pass
    expect(validateDescription('a'.repeat(5001)).valid).toBe(false) // 5001 chars - fail
  })

  it('price validation matches backend UsdcAmountSchema', () => {
    // Backend: positive decimal with up to 6 decimal places
    expect(validatePrice('0').valid).toBe(false) // zero - fail
    expect(validatePrice('0.01').valid).toBe(true) // positive - pass
    expect(validatePrice('999999.999999').valid).toBe(true) // 6 decimals - pass
    expect(validatePrice('1.1234567').valid).toBe(false) // 7 decimals - fail
  })
})
