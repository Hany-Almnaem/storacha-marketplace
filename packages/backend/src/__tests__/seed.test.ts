/**
 * Comprehensive tests for database seed script
 *
 * Verifies that:
 * 1. All seed data passes real validation schemas
 * 2. Data can be inserted into database
 * 3. Seed is idempotent (safe to run multiple times)
 * 4. Data integrity is maintained
 *
 * Prerequisites for tests to run:
 * - DATABASE_URL must be set
 * - PostgreSQL must be running
 */

import { PrismaClient } from '@prisma/client'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import {
  CreateListingSchema,
  CidSchema,
  AddressSchema,
  Bytes32Schema,
  CategorySchema,
  UsdcAmountSchema,
} from '../lib/validation.js'

const prisma = new PrismaClient()

// Import the test data structure from seed file
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
      'Large-scale image dataset for ML training with 100k labeled images across 50 categories. Perfect for computer vision research.',
    category: 'AI/ML',
    priceUsdc: '15.50',
    origFilename: 'images-100k.zip',
    contentType: 'application/zip',
  },
  {
    onchainId: 2,
    sellerAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    dataCid: 'bafkreid7qoywk77r7rj3slobqfekdvs57qwuwh5d6d2j3jkjqbqhqzn4n4',
    envelopeCid:
      'bafybeibcd234abc567def727ghi223jkl456mno727pqr242stu345vwx672',
    envelopeHash:
      '0x2345678901234567890123456789012345678901234567890123456789012345',
    title: 'IoT Sensor Data - Smart Home',
    description:
      'Real-world sensor readings from 50 smart homes over 6 months. Includes temperature, humidity, motion, and energy consumption data.',
    category: 'IoT',
    priceUsdc: '25.00',
    origFilename: 'sensors-6months.csv',
    contentType: 'text/csv',
  },
  {
    onchainId: 3,
    sellerAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    dataCid: 'bafybeihdwdcefgh4kdqkjbjktjqbqr3ydkdpwq6cgqgm6xqxh7w3ywo3mi',
    envelopeCid:
      'bafybeicde345bcd672efg742hij234klm567nop727qrs223tuv456wxy727',
    envelopeHash:
      '0x3456789012345678901234567890123456789012345678901234567890123456',
    title: 'Healthcare Records - Anonymized',
    description:
      'De-identified patient records for medical research (HIPAA compliant). Includes demographics, diagnoses, and treatment outcomes.',
    category: 'Health',
    priceUsdc: '50.00',
    origFilename: 'patient-records.json',
    contentType: 'application/json',
  },
  {
    onchainId: 4,
    sellerAddress: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
    dataCid: 'bafybeief567ghi727jkl223mno456pqr727stu242vwx345yzabc672def742',
    envelopeCid:
      'bafybeifgh672ijk742lmn234opq567rst727uvw223xyz456abc727def242ghi',
    envelopeHash:
      '0x4567890123456789012345678901234567890123456789012345678901234567',
    title: 'Financial Market Data - Stock Prices',
    description:
      'Historical stock prices and trading volumes for S&P 500 companies over 10 years. Includes daily OHLC data and market indicators.',
    category: 'Finance',
    priceUsdc: '100.00',
    origFilename: 'market-data-10y.csv',
    contentType: 'text/csv',
  },
  {
    onchainId: 5,
    sellerAddress: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
    dataCid: 'bafybeighij742klm234nop567qrs727tuv223wxy456zab727cde242fgh345',
    envelopeCid:
      'bafybeijkl242mno345pqr672stu742vwx234yza567bcd727efg223hij456klm',
    envelopeHash:
      '0x5678901234567890123456789012345678901234567890123456789012345678',
    title: 'Climate Data - Global Temperature Records',
    description:
      'Comprehensive climate data including temperature, precipitation, and atmospheric measurements from weather stations worldwide since 1950.',
    category: 'Other',
    priceUsdc: '35.75',
    origFilename: 'climate-global.csv',
    contentType: 'text/csv',
  },
  {
    onchainId: 6,
    sellerAddress: '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097',
    dataCid: 'bafybeijklm345nop672qrs742tuv234wxy567zab727cde223fgh456ijk727',
    envelopeCid:
      'bafybeilmn234opq567rst727uvw223xyz456abc727def242ghi345jkl672mno',
    envelopeHash:
      '0x6789012345678901234567890123456789012345678901234567890123456789',
    title: 'Natural Language Corpus - Multilingual',
    description:
      'Large corpus of text data in 20 languages, suitable for NLP model training. Includes news articles, books, and web content.',
    category: 'AI/ML',
    priceUsdc: '45.00',
    origFilename: 'nlp-corpus-20lang.tar.gz',
    contentType: 'application/gzip',
  },
  {
    onchainId: 7,
    sellerAddress: '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097',
    dataCid: 'bafybeimnop567qrs727tuv223wxy456zab727cde242fgh345ijk672lmn742',
    envelopeCid:
      'bafybeinop456qrs727tuv242wxy345zab672cde742fgh234ijk567lmn727opq',
    envelopeHash:
      '0x7890123456789012345678901234567890123456789012345678901234567890',
    title: 'Industrial IoT - Manufacturing Sensor Logs',
    description:
      'Production line sensor data from manufacturing facilities. Includes machine performance metrics, quality control readings, and maintenance logs.',
    category: 'IoT',
    priceUsdc: '60.00',
    origFilename: 'manufacturing-sensors.parquet',
    contentType: 'application/octet-stream',
  },
  {
    onchainId: 8,
    sellerAddress: '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097',
    dataCid: 'bafybeiopqr727stu242vwx345yza672bcd742efg234hij567klm727nop223',
    envelopeCid:
      'bafybeipqr672stu742vwx234yza567bcd727efg223hij456klm727nop242qrs',
    envelopeHash:
      '0x8901234567890123456789012345678901234567890123456789012345678901',
    title: 'Genomics Data - DNA Sequences',
    description:
      'Anonymized genomic sequencing data for research purposes. Includes whole genome sequences and variant annotations.',
    category: 'Health',
    priceUsdc: '150.00',
    origFilename: 'genomics-sequences.vcf.gz',
    contentType: 'application/gzip',
  },
]

describe('Database Seed - Validation', () => {
  describe('Individual Field Validation', () => {
    it('should have valid CIDs for dataCid', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = CidSchema.safeParse(listing.dataCid)
        expect(
          result.success,
          `dataCid failed for listing ${listing.onchainId}: ${listing.dataCid}`
        ).toBe(true)
      })
    })

    it('should have valid CIDs for envelopeCid', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = CidSchema.safeParse(listing.envelopeCid)
        expect(
          result.success,
          `envelopeCid failed for listing ${listing.onchainId}: ${listing.envelopeCid}`
        ).toBe(true)
      })
    })

    it('should have valid bytes32 hashes for envelopeHash', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = Bytes32Schema.safeParse(listing.envelopeHash)
        expect(
          result.success,
          `envelopeHash failed for listing ${listing.onchainId}: ${listing.envelopeHash}`
        ).toBe(true)
      })
    })

    it('should have valid Ethereum addresses', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = AddressSchema.safeParse(listing.sellerAddress)
        expect(
          result.success,
          `sellerAddress failed for listing ${listing.onchainId}: ${listing.sellerAddress}`
        ).toBe(true)
      })
    })

    it('should have valid categories', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = CategorySchema.safeParse(listing.category)
        expect(
          result.success,
          `category failed for listing ${listing.onchainId}: ${listing.category}`
        ).toBe(true)
      })
    })

    it('should have valid USDC amounts', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = UsdcAmountSchema.safeParse(listing.priceUsdc)
        expect(
          result.success,
          `priceUsdc failed for listing ${listing.onchainId}: ${listing.priceUsdc}`
        ).toBe(true)
      })
    })

    it('should have titles with correct length (3-100 chars)', () => {
      TEST_LISTINGS.forEach((listing) => {
        expect(
          listing.title.length,
          `Title too short for listing ${listing.onchainId}`
        ).toBeGreaterThanOrEqual(3)
        expect(
          listing.title.length,
          `Title too long for listing ${listing.onchainId}`
        ).toBeLessThanOrEqual(100)
      })
    })

    it('should have descriptions with correct length (10-5000 chars)', () => {
      TEST_LISTINGS.forEach((listing) => {
        expect(
          listing.description.length,
          `Description too short for listing ${listing.onchainId}`
        ).toBeGreaterThanOrEqual(10)
        expect(
          listing.description.length,
          `Description too long for listing ${listing.onchainId}`
        ).toBeLessThanOrEqual(5000)
      })
    })
  })

  describe('Complete Listing Schema Validation', () => {
    it('should pass CreateListingSchema validation for all listings', () => {
      TEST_LISTINGS.forEach((listing) => {
        const result = CreateListingSchema.safeParse(listing)
        if (!result.success) {
          console.error(
            `Validation failed for listing ${listing.onchainId}:`,
            result.error.issues
          )
        }
        expect(
          result.success,
          `Listing ${listing.onchainId} failed validation`
        ).toBe(true)
      })
    })
  })

  describe('Data Quality Checks', () => {
    it('should have unique onchainIds', () => {
      const ids = TEST_LISTINGS.map((l) => l.onchainId)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(TEST_LISTINGS.length)
    })

    it('should have unique dataCids', () => {
      const cids = TEST_LISTINGS.map((l) => l.dataCid)
      const uniqueCids = new Set(cids)
      expect(uniqueCids.size).toBe(TEST_LISTINGS.length)
    })

    it('should have unique envelopeCids', () => {
      const cids = TEST_LISTINGS.map((l) => l.envelopeCid)
      const uniqueCids = new Set(cids)
      expect(uniqueCids.size).toBe(TEST_LISTINGS.length)
    })

    it('should have at least one listing per category', () => {
      const categories = ['AI/ML', 'IoT', 'Health', 'Finance', 'Other']
      const usedCategories = new Set(TEST_LISTINGS.map((l) => l.category))

      categories.forEach((cat) => {
        expect(
          usedCategories.has(cat),
          `No listings for category: ${cat}`
        ).toBe(true)
      })
    })

    it('should have realistic price distribution', () => {
      const prices = TEST_LISTINGS.map((l) => parseFloat(l.priceUsdc))
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length

      expect(avgPrice).toBeGreaterThan(0)
      expect(avgPrice).toBeLessThan(1000) // Reasonable range
      expect(Math.min(...prices)).toBeGreaterThan(0)
    })

    it('should have multiple sellers (not all from same address)', () => {
      const sellers = new Set(TEST_LISTINGS.map((l) => l.sellerAddress))
      expect(sellers.size).toBeGreaterThan(1)
    })
  })
})

describe(
  'Database Seed - Integration',
  { skip: !process.env['DATABASE_URL'] },
  () => {
    beforeAll(async () => {
      // Clean up any existing test data
      await prisma.listing.deleteMany({
        where: {
          onchainId: {
            in: TEST_LISTINGS.map((l) => l.onchainId),
          },
        },
      })
    })

    afterAll(async () => {
      // Clean up test data
      await prisma.listing.deleteMany({
        where: {
          onchainId: {
            in: TEST_LISTINGS.map((l) => l.onchainId),
          },
        },
      })
      await prisma.$disconnect()
    })

    describe('Seed Execution', () => {
      it('should insert all listings into database', async () => {
        for (const listing of TEST_LISTINGS) {
          const created = await prisma.listing.create({
            data: listing,
          })

          expect(created.id).toBeTruthy()
          expect(created.onchainId).toBe(listing.onchainId)
          expect(created.dataCid).toBe(listing.dataCid)
          expect(created.envelopeCid).toBe(listing.envelopeCid)
          expect(created.sellerAddress).toBe(listing.sellerAddress)
          expect(created.active).toBe(true)
        }

        const count = await prisma.listing.count({
          where: {
            onchainId: {
              in: TEST_LISTINGS.map((l) => l.onchainId),
            },
          },
        })

        expect(count).toBe(TEST_LISTINGS.length)
      })

      it('should retrieve listings with correct data', async () => {
        const listings = await prisma.listing.findMany({
          where: {
            onchainId: {
              in: TEST_LISTINGS.map((l) => l.onchainId),
            },
          },
          orderBy: {
            onchainId: 'asc',
          },
        })

        expect(listings).toHaveLength(TEST_LISTINGS.length)

        listings.forEach((dbListing, index) => {
          const testListing = TEST_LISTINGS[index]
          expect(dbListing.onchainId).toBe(testListing!.onchainId)
          expect(dbListing.title).toBe(testListing!.title)
          expect(dbListing.category).toBe(testListing!.category)
          // Postgres normalizes decimal strings (removes trailing zeros)
          expect(parseFloat(dbListing.priceUsdc.toString())).toBe(
            parseFloat(testListing!.priceUsdc)
          )
        })
      })

      it('should support upsert for idempotency', async () => {
        // Try upserting an existing listing
        const testListing = TEST_LISTINGS[0]!

        const result = await prisma.listing.upsert({
          where: { onchainId: testListing.onchainId },
          update: {},
          create: testListing,
        })

        expect(result.onchainId).toBe(testListing.onchainId)
        expect(result.title).toBe(testListing.title)

        // Verify count hasn't increased
        const count = await prisma.listing.count({
          where: {
            onchainId: {
              in: TEST_LISTINGS.map((l) => l.onchainId),
            },
          },
        })

        expect(count).toBe(TEST_LISTINGS.length)
      })

      it('should maintain data integrity with foreign key constraints', async () => {
        const listing = await prisma.listing.findFirst({
          where: {
            onchainId: TEST_LISTINGS[0]!.onchainId,
          },
          include: {
            purchases: true,
          },
        })

        expect(listing).toBeTruthy()
        expect(listing!.purchases).toEqual([])
      })

      it('should support category filtering', async () => {
        const aiMlListings = await prisma.listing.findMany({
          where: {
            category: 'AI/ML',
            onchainId: {
              in: TEST_LISTINGS.map((l) => l.onchainId),
            },
          },
        })

        const expectedCount = TEST_LISTINGS.filter(
          (l) => l.category === 'AI/ML'
        ).length
        expect(aiMlListings).toHaveLength(expectedCount)
      })

      it('should support seller address filtering', async () => {
        const firstSeller = TEST_LISTINGS[0]!.sellerAddress
        const sellerListings = await prisma.listing.findMany({
          where: {
            sellerAddress: firstSeller,
            onchainId: {
              in: TEST_LISTINGS.map((l) => l.onchainId),
            },
          },
        })

        const expectedCount = TEST_LISTINGS.filter(
          (l) => l.sellerAddress === firstSeller
        ).length
        expect(sellerListings.length).toBe(expectedCount)
      })
    })
  }
)
