/**
 * Comprehensive tests for database seed script
 */

import { PrismaClient } from '@prisma/client'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import {
  CidSchema,
  AddressSchema,
  Bytes32Schema,
  CategorySchema,
  UsdcAmountSchema,
} from '../lib/validation.js'

const prisma = new PrismaClient()

// IMPORTANT: priceUsdc now stored in RAW USDC units
// 1 USDC = 1_000_000
const TEST_LISTINGS = [
  {
    onchainId: 1,
    sellerAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    dataCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    envelopeCid:
      'bafybeiabc223xyz456def727ghi242jkl345mno672pqr742stu234vwx567',
    envelopeHash:
      '0x1234567890123456789012345678901234567890123456789012345678901234',
    title: 'AI Training Dataset - Image Classification',
    description:
      'Large-scale image dataset for ML training with 100k labeled images.',
    category: 'AI/ML',
    priceUsdc: '15500000',
    origFilename: 'images-100k.zip',
    contentType: 'application/zip',
    txHash:
      '0x12345678901234567890123456789r34334567890123456789012345678901234',
  },
]

describe('Database Seed - Validation', () => {
  it('should have valid dataCid', () => {
    TEST_LISTINGS.forEach((listing) => {
      expect(CidSchema.safeParse(listing.dataCid).success).toBe(true)
    })
  })

  it('should have valid envelopeCid', () => {
    TEST_LISTINGS.forEach((listing) => {
      expect(CidSchema.safeParse(listing.envelopeCid).success).toBe(true)
    })
  })

  it('should have valid envelopeHash', () => {
    TEST_LISTINGS.forEach((listing) => {
      expect(Bytes32Schema.safeParse(listing.envelopeHash).success).toBe(true)
    })
  })

  it('should have valid sellerAddress', () => {
    TEST_LISTINGS.forEach((listing) => {
      expect(AddressSchema.safeParse(listing.sellerAddress).success).toBe(true)
    })
  })

  it('should have valid categories', () => {
    TEST_LISTINGS.forEach((listing) => {
      expect(CategorySchema.safeParse(listing.category).success).toBe(true)
    })
  })

  it('should have valid USDC amount format', () => {
    TEST_LISTINGS.forEach((listing) => {
      expect(UsdcAmountSchema.safeParse(listing.priceUsdc).success).toBe(true)
    })
  })
})

describe(
  'Database Seed - Integration',
  { skip: !process.env['DATABASE_URL'] },
  () => {
    beforeAll(async () => {
      await prisma.listing.deleteMany({
        where: {
          onchainId: {
            in: TEST_LISTINGS.map((l) => l.onchainId),
          },
        },
      })
    })

    afterAll(async () => {
      await prisma.listing.deleteMany({
        where: {
          onchainId: {
            in: TEST_LISTINGS.map((l) => l.onchainId),
          },
        },
      })

      await prisma.$disconnect()
    })

    it('should insert listings into database', async () => {
      for (const listing of TEST_LISTINGS) {
        const created = await prisma.listing.create({
          data: listing,
        })

        expect(created.id).toBeTruthy()
        expect(created.onchainId).toBe(listing.onchainId)
        expect(created.dataCid).toBe(listing.dataCid)
        expect(created.envelopeCid).toBe(listing.envelopeCid)
      }
    })

    it('should retrieve inserted listings', async () => {
      const listings = await prisma.listing.findMany({
        where: {
          onchainId: {
            in: TEST_LISTINGS.map((l) => l.onchainId),
          },
        },
      })

      expect(listings.length).toBe(TEST_LISTINGS.length)
    })

    it('should support idempotent seed via upsert', async () => {
      const listing = TEST_LISTINGS[0]

      const result = await prisma.listing.upsert({
        where: { onchainId: listing.onchainId },
        update: {},
        create: listing,
      })

      expect(result.onchainId).toBe(listing.onchainId)
    })

    it('should allow category filtering', async () => {
      const listings = await prisma.listing.findMany({
        where: { category: 'AI/ML' },
      })

      expect(listings.length).toBeGreaterThan(0)
    })

    it('should allow seller filtering', async () => {
      const seller = TEST_LISTINGS[0].sellerAddress

      const listings = await prisma.listing.findMany({
        where: { sellerAddress: seller },
      })

      expect(listings.length).toBeGreaterThan(0)
    })
  }
)
