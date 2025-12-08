import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'

import {
  // Regex patterns
  cidRegex,
  addressRegex,
  txHashRegex,
  bytes32Regex,
  usdcAmountRegex,
  // Schemas
  CidSchema,
  AddressSchema,
  CategorySchema,
  CreateListingSchema,
  UpdateListingSchema,
  CreatePurchaseSchema,
  BindKeySchema,
  DeliverKeySchema,
  VerifyPurchaseSchema,
  ListingQuerySchema,
  // Helpers
  validate,
  validateSafe,
  isValidCid,
  isValidAddress,
  isValidTxHash,
  isValidBytes32,
} from '../lib/validation.js'

// ============================================================================
// Test Data
// ============================================================================

const VALID_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const VALID_ADDRESS = '0x1234567890123456789012345678901234567890'
const VALID_TX_HASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
const VALID_BYTES32 =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

// ============================================================================
// Regex Tests
// ============================================================================

describe('Regex Patterns', () => {
  describe('cidRegex', () => {
    it('should match valid CIDv1 (base32)', () => {
      expect(cidRegex.test(VALID_CID)).toBe(true)
      expect(
        cidRegex.test(
          'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'
        )
      ).toBe(true)
    })

    it('should reject invalid CIDs', () => {
      expect(cidRegex.test('Qm...')).toBe(false) // CIDv0
      expect(cidRegex.test('not-a-cid')).toBe(false)
      expect(cidRegex.test('bafy')).toBe(false) // Too short
      expect(cidRegex.test('')).toBe(false)
    })
  })

  describe('addressRegex', () => {
    it('should match valid Ethereum addresses', () => {
      expect(addressRegex.test(VALID_ADDRESS)).toBe(true)
      expect(
        addressRegex.test('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')
      ).toBe(true) // uppercase
      expect(
        addressRegex.test('0xabcdef1234567890abcdef1234567890abcdef12')
      ).toBe(true) // lowercase
    })

    it('should reject invalid addresses', () => {
      expect(
        addressRegex.test('1234567890123456789012345678901234567890')
      ).toBe(false) // no 0x
      expect(addressRegex.test('0x123')).toBe(false) // too short
      expect(
        addressRegex.test('0x12345678901234567890123456789012345678901')
      ).toBe(false) // too long
      expect(
        addressRegex.test('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')
      ).toBe(false) // invalid hex
    })
  })

  describe('txHashRegex', () => {
    it('should match valid transaction hashes', () => {
      expect(txHashRegex.test(VALID_TX_HASH)).toBe(true)
    })

    it('should reject invalid transaction hashes', () => {
      expect(txHashRegex.test('0x123')).toBe(false) // too short
      expect(txHashRegex.test(VALID_TX_HASH + 'ab')).toBe(false) // too long
      expect(txHashRegex.test('not-a-hash')).toBe(false)
    })
  })

  describe('bytes32Regex', () => {
    it('should match valid bytes32 hashes', () => {
      expect(bytes32Regex.test(VALID_BYTES32)).toBe(true)
    })

    it('should reject invalid bytes32', () => {
      expect(bytes32Regex.test('0x123')).toBe(false)
      expect(bytes32Regex.test('')).toBe(false)
    })
  })

  describe('usdcAmountRegex', () => {
    it('should match valid USDC amounts', () => {
      expect(usdcAmountRegex.test('100')).toBe(true)
      expect(usdcAmountRegex.test('100.5')).toBe(true)
      expect(usdcAmountRegex.test('100.123456')).toBe(true) // 6 decimals
      expect(usdcAmountRegex.test('0.000001')).toBe(true)
    })

    it('should reject invalid USDC amounts', () => {
      expect(usdcAmountRegex.test('100.1234567')).toBe(false) // 7 decimals
      expect(usdcAmountRegex.test('-100')).toBe(false) // negative
      expect(usdcAmountRegex.test('abc')).toBe(false)
      expect(usdcAmountRegex.test('')).toBe(false)
    })
  })
})

// ============================================================================
// Base Schema Tests
// ============================================================================

describe('Base Schemas', () => {
  describe('CidSchema', () => {
    it('should accept valid CIDs', () => {
      expect(() => CidSchema.parse(VALID_CID)).not.toThrow()
    })

    it('should reject invalid CIDs with descriptive error', () => {
      const result = CidSchema.safeParse('invalid')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Invalid CID format')
      }
    })
  })

  describe('AddressSchema', () => {
    it('should accept valid addresses', () => {
      expect(() => AddressSchema.parse(VALID_ADDRESS)).not.toThrow()
    })

    it('should reject invalid addresses', () => {
      const result = AddressSchema.safeParse('not-an-address')
      expect(result.success).toBe(false)
    })
  })

  describe('CategorySchema', () => {
    it('should accept valid categories', () => {
      expect(() => CategorySchema.parse('AI/ML')).not.toThrow()
      expect(() => CategorySchema.parse('IoT')).not.toThrow()
      expect(() => CategorySchema.parse('Health')).not.toThrow()
      expect(() => CategorySchema.parse('Finance')).not.toThrow()
      expect(() => CategorySchema.parse('Other')).not.toThrow()
    })

    it('should reject invalid categories', () => {
      const result = CategorySchema.safeParse('InvalidCategory')
      expect(result.success).toBe(false)
    })
  })
})

// ============================================================================
// CreateListingSchema Tests
// ============================================================================

describe('CreateListingSchema', () => {
  const validListing = {
    onchainId: 1,
    dataCid: VALID_CID,
    envelopeCid: VALID_CID,
    envelopeHash: VALID_BYTES32,
    title: 'Test Dataset',
    description: 'This is a test dataset for the marketplace',
    category: 'AI/ML',
    priceUsdc: '10.00',
  }

  it('should accept valid listing data', () => {
    const result = CreateListingSchema.safeParse(validListing)
    expect(result.success).toBe(true)
  })

  it('should accept listing with optional fields', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      origFilename: 'dataset.csv',
      contentType: 'text/csv',
    })
    expect(result.success).toBe(true)
  })

  it('should reject negative onchainId', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      onchainId: -1,
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid dataCid', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      dataCid: 'invalid-cid',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid envelopeCid', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      envelopeCid: 'invalid-cid',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid envelopeHash', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      envelopeHash: 'not-a-hash',
    })
    expect(result.success).toBe(false)
  })

  it('should reject title too short', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      title: 'AB',
    })
    expect(result.success).toBe(false)
  })

  it('should reject title too long', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      title: 'A'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  it('should reject description too short', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      description: 'Too short',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid category', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      category: 'InvalidCategory',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid priceUsdc format', () => {
    const result = CreateListingSchema.safeParse({
      ...validListing,
      priceUsdc: 'not-a-price',
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// UpdateListingSchema Tests
// ============================================================================

describe('UpdateListingSchema', () => {
  it('should accept partial updates', () => {
    expect(UpdateListingSchema.safeParse({ title: 'New Title' }).success).toBe(
      true
    )
    expect(UpdateListingSchema.safeParse({ active: false }).success).toBe(true)
    expect(UpdateListingSchema.safeParse({}).success).toBe(true)
  })

  it('should reject invalid partial updates', () => {
    expect(UpdateListingSchema.safeParse({ title: 'AB' }).success).toBe(false)
    expect(UpdateListingSchema.safeParse({ category: 'Invalid' }).success).toBe(
      false
    )
  })
})

// ============================================================================
// CreatePurchaseSchema Tests
// ============================================================================

describe('CreatePurchaseSchema', () => {
  it('should accept valid purchase data', () => {
    const result = CreatePurchaseSchema.safeParse({
      listingId: 'clh1234567890abcdef12345',
      buyerAddress: VALID_ADDRESS,
      txHash: VALID_TX_HASH,
      amountUsdc: '10.00',
    })
    expect(result.success).toBe(true)
  })

  it('should accept purchase with blockNumber', () => {
    const result = CreatePurchaseSchema.safeParse({
      listingId: 'clh1234567890abcdef12345',
      buyerAddress: VALID_ADDRESS,
      txHash: VALID_TX_HASH,
      amountUsdc: '10.00',
      blockNumber: 12345678,
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid listingId', () => {
    const result = CreatePurchaseSchema.safeParse({
      listingId: 'invalid',
      buyerAddress: VALID_ADDRESS,
      txHash: VALID_TX_HASH,
      amountUsdc: '10.00',
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// BindKeySchema Tests
// ============================================================================

describe('BindKeySchema', () => {
  it('should accept valid key binding data', () => {
    const result = BindKeySchema.safeParse({
      publicKey: '{"kty":"RSA",...}',
      signature: '0x...',
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty publicKey', () => {
    const result = BindKeySchema.safeParse({
      publicKey: '',
      signature: '0x...',
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty signature', () => {
    const result = BindKeySchema.safeParse({
      publicKey: '{"kty":"RSA",...}',
      signature: '',
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// DeliverKeySchema Tests
// ============================================================================

describe('DeliverKeySchema', () => {
  it('should accept valid keyCid', () => {
    const result = DeliverKeySchema.safeParse({
      keyCid: VALID_CID,
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid keyCid', () => {
    const result = DeliverKeySchema.safeParse({
      keyCid: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// VerifyPurchaseSchema Tests
// ============================================================================

describe('VerifyPurchaseSchema', () => {
  it('should accept valid verification request', () => {
    const result = VerifyPurchaseSchema.safeParse({
      txHash: VALID_TX_HASH,
      expectedListingId: 1,
      expectedBuyer: VALID_ADDRESS,
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid txHash', () => {
    const result = VerifyPurchaseSchema.safeParse({
      txHash: 'invalid',
      expectedListingId: 1,
      expectedBuyer: VALID_ADDRESS,
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// ListingQuerySchema Tests
// ============================================================================

describe('ListingQuerySchema', () => {
  it('should accept empty query (defaults)', () => {
    const result = ListingQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(20)
      expect(result.data.offset).toBe(0)
    }
  })

  it('should accept valid query parameters', () => {
    const result = ListingQuerySchema.safeParse({
      category: 'AI/ML',
      seller: VALID_ADDRESS,
      active: 'true',
      limit: '50',
      offset: '10',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('AI/ML')
      expect(result.data.active).toBe(true)
      expect(result.data.limit).toBe(50)
      expect(result.data.offset).toBe(10)
    }
  })

  it('should reject limit over 100', () => {
    const result = ListingQuerySchema.safeParse({
      limit: '101',
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('Validation Helpers', () => {
  describe('validate', () => {
    it('should return parsed value on success', () => {
      const result = validate(CidSchema, VALID_CID)
      expect(result).toBe(VALID_CID)
    })

    it('should throw ZodError on failure', () => {
      expect(() => validate(CidSchema, 'invalid')).toThrow(ZodError)
    })
  })

  describe('validateSafe', () => {
    it('should return success result on valid input', () => {
      const result = validateSafe(CidSchema, VALID_CID)
      expect(result.success).toBe(true)
    })

    it('should return error result on invalid input', () => {
      const result = validateSafe(CidSchema, 'invalid')
      expect(result.success).toBe(false)
    })
  })

  describe('isValidCid', () => {
    it('should return true for valid CID', () => {
      expect(isValidCid(VALID_CID)).toBe(true)
    })

    it('should return false for invalid CID', () => {
      expect(isValidCid('invalid')).toBe(false)
    })
  })

  describe('isValidAddress', () => {
    it('should return true for valid address', () => {
      expect(isValidAddress(VALID_ADDRESS)).toBe(true)
    })

    it('should return false for invalid address', () => {
      expect(isValidAddress('invalid')).toBe(false)
    })
  })

  describe('isValidTxHash', () => {
    it('should return true for valid tx hash', () => {
      expect(isValidTxHash(VALID_TX_HASH)).toBe(true)
    })

    it('should return false for invalid tx hash', () => {
      expect(isValidTxHash('invalid')).toBe(false)
    })
  })

  describe('isValidBytes32', () => {
    it('should return true for valid bytes32', () => {
      expect(isValidBytes32(VALID_BYTES32)).toBe(true)
    })

    it('should return false for invalid bytes32', () => {
      expect(isValidBytes32('invalid')).toBe(false)
    })
  })
})
