/**
 * Integration tests for database operations.
 *
 * These tests require a running PostgreSQL database.
 * Run with: docker compose up -d postgres
 *
 * Set DATABASE_URL environment variable or tests will be skipped.
 */

import { PrismaClient } from '@prisma/client'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

// Test data constants
const TEST_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const TEST_ENVELOPE_CID =
  'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'
const TEST_ENVELOPE_HASH =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const TEST_SELLER_ADDRESS = '0x1111111111111111111111111111111111111111'
const TEST_BUYER_ADDRESS = '0x2222222222222222222222222222222222222222'
const _TEST_TX_HASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

// Check if database is available
const DATABASE_URL = process.env['DATABASE_URL']
const skipTests = !DATABASE_URL

// Create a test-specific Prisma client
let prisma: PrismaClient

// Track created records for cleanup
const createdListingIds: string[] = []
const createdPurchaseIds: string[] = []
const createdEventLogIds: string[] = []

describe.skipIf(skipTests)('Database Integration Tests', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: DATABASE_URL,
        },
      },
    })
    await prisma.$connect()
  })

  afterAll(async () => {
    // Clean up test data in reverse order (purchases first, then listings)
    if (createdPurchaseIds.length > 0) {
      await prisma.purchase.deleteMany({
        where: { id: { in: createdPurchaseIds } },
      })
    }
    if (createdListingIds.length > 0) {
      await prisma.listing.deleteMany({
        where: { id: { in: createdListingIds } },
      })
    }
    if (createdEventLogIds.length > 0) {
      await prisma.eventLog.deleteMany({
        where: { id: { in: createdEventLogIds } },
      })
    }
    await prisma.$disconnect()
  })

  beforeEach(() => {
    // Generate unique onchainId for each test to avoid conflicts
    // Using timestamp + random to ensure uniqueness
  })

  describe('Listing CRUD Operations', () => {
    it('should create a listing with all required fields', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000)

      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Integration Test Dataset',
          description: 'This is a test dataset for integration testing',
          category: 'AI/ML',
          priceUsdc: '10.000000',
          active: true,
        },
      })

      createdListingIds.push(listing.id)

      expect(listing.id).toBeDefined()
      expect(listing.onchainId).toBe(uniqueOnchainId)
      expect(listing.sellerAddress).toBe(TEST_SELLER_ADDRESS)
      expect(listing.dataCid).toBe(TEST_CID)
      expect(listing.envelopeCid).toBe(TEST_ENVELOPE_CID)
      expect(listing.envelopeHash).toBe(TEST_ENVELOPE_HASH)
      expect(listing.title).toBe('Integration Test Dataset')
      expect(listing.category).toBe('AI/ML')
      expect(listing.priceUsdc.toString()).toBe('10')
      expect(listing.active).toBe(true)
      expect(listing.createdAt).toBeInstanceOf(Date)
      expect(listing.updatedAt).toBeInstanceOf(Date)
    })

    it('should create a listing with optional fields', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 1

      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Test with Optional Fields',
          description: 'This dataset has optional fields populated',
          category: 'IoT',
          priceUsdc: '25.500000',
          origFilename: 'sensor_data.csv',
          contentType: 'text/csv',
        },
      })

      createdListingIds.push(listing.id)

      expect(listing.origFilename).toBe('sensor_data.csv')
      expect(listing.contentType).toBe('text/csv')
    })

    it('should enforce unique onchainId constraint', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 2

      // Create first listing
      const listing1 = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'First Listing',
          description: 'First listing for unique constraint test',
          category: 'Finance',
          priceUsdc: '100.000000',
        },
      })

      createdListingIds.push(listing1.id)

      // Try to create second listing with same onchainId
      await expect(
        prisma.listing.create({
          data: {
            onchainId: uniqueOnchainId, // Same ID
            sellerAddress: TEST_SELLER_ADDRESS,
            dataCid: TEST_CID,
            envelopeCid: TEST_ENVELOPE_CID,
            envelopeHash: TEST_ENVELOPE_HASH,
            title: 'Duplicate Listing',
            description: 'This should fail due to unique constraint',
            category: 'Finance',
            priceUsdc: '50.000000',
          },
        })
      ).rejects.toThrow()
    })

    it('should query listings by category', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 3

      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Health Dataset',
          description: 'Test dataset in Health category for filtering',
          category: 'Health',
          priceUsdc: '15.000000',
        },
      })

      createdListingIds.push(listing.id)

      const healthListings = await prisma.listing.findMany({
        where: {
          category: 'Health',
          id: { in: createdListingIds },
        },
      })

      expect(healthListings.length).toBeGreaterThanOrEqual(1)
      expect(healthListings.some((l) => l.id === listing.id)).toBe(true)
    })

    it('should update listing status', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 4

      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Listing to Deactivate',
          description: 'This listing will be deactivated',
          category: 'Other',
          priceUsdc: '5.000000',
          active: true,
        },
      })

      createdListingIds.push(listing.id)

      const updatedListing = await prisma.listing.update({
        where: { id: listing.id },
        data: { active: false },
      })

      expect(updatedListing.active).toBe(false)
      expect(updatedListing.updatedAt.getTime()).toBeGreaterThan(
        listing.updatedAt.getTime()
      )
    })
  })

  describe('Purchase CRUD Operations', () => {
    let testListingId: string

    beforeAll(async () => {
      // Create a listing for purchase tests
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 100

      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Listing for Purchase Tests',
          description: 'This listing is used for purchase integration tests',
          category: 'AI/ML',
          priceUsdc: '20.000000',
        },
      })

      testListingId = listing.id
      createdListingIds.push(listing.id)
    })

    it('should create a purchase record', async () => {
      const uniqueTxHash = `0x${Date.now().toString(16)}${'0'.repeat(48)}`

      const purchase = await prisma.purchase.create({
        data: {
          listingId: testListingId,
          buyerAddress: TEST_BUYER_ADDRESS,
          txHash: uniqueTxHash,
          amountUsdc: '20.000000',
          txVerified: false,
        },
      })

      createdPurchaseIds.push(purchase.id)

      expect(purchase.id).toBeDefined()
      expect(purchase.listingId).toBe(testListingId)
      expect(purchase.buyerAddress).toBe(TEST_BUYER_ADDRESS)
      expect(purchase.txHash).toBe(uniqueTxHash)
      expect(purchase.amountUsdc.toString()).toBe('20')
      expect(purchase.txVerified).toBe(false)
      expect(purchase.keyDelivered).toBe(false)
    })

    it('should create a verified purchase with block number', async () => {
      const uniqueTxHash = `0x${(Date.now() + 1).toString(16)}${'0'.repeat(48)}`

      const purchase = await prisma.purchase.create({
        data: {
          listingId: testListingId,
          buyerAddress: '0x3333333333333333333333333333333333333333',
          txHash: uniqueTxHash,
          amountUsdc: '20.000000',
          txVerified: true,
          blockNumber: 12345678,
        },
      })

      createdPurchaseIds.push(purchase.id)

      expect(purchase.txVerified).toBe(true)
      expect(purchase.blockNumber).toBe(12345678)
    })

    it('should enforce unique txHash constraint', async () => {
      const uniqueTxHash = `0x${(Date.now() + 2).toString(16)}${'0'.repeat(48)}`

      const purchase1 = await prisma.purchase.create({
        data: {
          listingId: testListingId,
          buyerAddress: '0x4444444444444444444444444444444444444444',
          txHash: uniqueTxHash,
          amountUsdc: '20.000000',
        },
      })

      createdPurchaseIds.push(purchase1.id)

      await expect(
        prisma.purchase.create({
          data: {
            listingId: testListingId,
            buyerAddress: '0x5555555555555555555555555555555555555555',
            txHash: uniqueTxHash, // Same tx hash
            amountUsdc: '20.000000',
          },
        })
      ).rejects.toThrow()
    })

    it('should enforce unique [listingId, buyerAddress] constraint', async () => {
      const uniqueBuyer = '0x6666666666666666666666666666666666666666'
      const uniqueTxHash1 = `0x${(Date.now() + 3).toString(16)}${'0'.repeat(48)}`
      const uniqueTxHash2 = `0x${(Date.now() + 4).toString(16)}${'0'.repeat(48)}`

      const purchase1 = await prisma.purchase.create({
        data: {
          listingId: testListingId,
          buyerAddress: uniqueBuyer,
          txHash: uniqueTxHash1,
          amountUsdc: '20.000000',
        },
      })

      createdPurchaseIds.push(purchase1.id)

      await expect(
        prisma.purchase.create({
          data: {
            listingId: testListingId, // Same listing
            buyerAddress: uniqueBuyer, // Same buyer
            txHash: uniqueTxHash2, // Different tx
            amountUsdc: '20.000000',
          },
        })
      ).rejects.toThrow()
    })

    it('should update purchase with key delivery', async () => {
      const uniqueTxHash = `0x${(Date.now() + 5).toString(16)}${'0'.repeat(48)}`
      const keyCid =
        'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

      const purchase = await prisma.purchase.create({
        data: {
          listingId: testListingId,
          buyerAddress: '0x7777777777777777777777777777777777777777',
          txHash: uniqueTxHash,
          amountUsdc: '20.000000',
          txVerified: true,
          blockNumber: 12345679,
          buyerPublicKey: '{"kty":"RSA","n":"..."}',
          publicKeySignature: '0xsignature...',
        },
      })

      createdPurchaseIds.push(purchase.id)

      const updatedPurchase = await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          keyCid: keyCid,
          keyDelivered: true,
          keyDeliveredAt: new Date(),
        },
      })

      expect(updatedPurchase.keyCid).toBe(keyCid)
      expect(updatedPurchase.keyDelivered).toBe(true)
      expect(updatedPurchase.keyDeliveredAt).toBeInstanceOf(Date)
    })
  })

  describe('Listing-Purchase Relationship', () => {
    it('should include purchases when querying listing', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 200
      const uniqueTxHash = `0x${(Date.now() + 10).toString(16)}${'0'.repeat(48)}`

      // Create listing
      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Listing with Purchase',
          description: 'This listing has a purchase for relationship test',
          category: 'AI/ML',
          priceUsdc: '30.000000',
        },
      })

      createdListingIds.push(listing.id)

      // Create purchase for this listing
      const purchase = await prisma.purchase.create({
        data: {
          listingId: listing.id,
          buyerAddress: TEST_BUYER_ADDRESS,
          txHash: uniqueTxHash,
          amountUsdc: '30.000000',
          txVerified: true,
        },
      })

      createdPurchaseIds.push(purchase.id)

      // Query listing with purchases
      const listingWithPurchases = await prisma.listing.findUnique({
        where: { id: listing.id },
        include: { purchases: true },
      })

      expect(listingWithPurchases).not.toBeNull()
      expect(listingWithPurchases!.purchases).toHaveLength(1)
      expect(listingWithPurchases!.purchases[0].id).toBe(purchase.id)
      expect(listingWithPurchases!.purchases[0].buyerAddress).toBe(
        TEST_BUYER_ADDRESS
      )
    })

    it('should include listing when querying purchase', async () => {
      const uniqueOnchainId =
        Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + 201
      const uniqueTxHash = `0x${(Date.now() + 11).toString(16)}${'0'.repeat(48)}`

      // Create listing
      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueOnchainId,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Another Listing',
          description: 'Another listing for relationship test',
          category: 'Finance',
          priceUsdc: '50.000000',
        },
      })

      createdListingIds.push(listing.id)

      // Create purchase
      const purchase = await prisma.purchase.create({
        data: {
          listingId: listing.id,
          buyerAddress: '0x8888888888888888888888888888888888888888',
          txHash: uniqueTxHash,
          amountUsdc: '50.000000',
        },
      })

      createdPurchaseIds.push(purchase.id)

      // Query purchase with listing
      const purchaseWithListing = await prisma.purchase.findUnique({
        where: { id: purchase.id },
        include: { listing: true },
      })

      expect(purchaseWithListing).not.toBeNull()
      expect(purchaseWithListing!.listing.id).toBe(listing.id)
      expect(purchaseWithListing!.listing.title).toBe('Another Listing')
    })
  })

  describe('EventLog Operations', () => {
    it('should create and query event logs', async () => {
      const uniqueTxHash = `0x${(Date.now() + 20).toString(16)}${'0'.repeat(48)}`

      const eventLog = await prisma.eventLog.create({
        data: {
          eventType: 'PurchaseCompleted',
          txHash: uniqueTxHash,
          blockNumber: 12345680,
          logIndex: 0,
          processed: false,
          data: {
            listingId: 1,
            buyer: TEST_BUYER_ADDRESS,
            seller: TEST_SELLER_ADDRESS,
            amountUsdc: '20000000',
          },
        },
      })

      createdEventLogIds.push(eventLog.id)

      expect(eventLog.id).toBeDefined()
      expect(eventLog.eventType).toBe('PurchaseCompleted')
      expect(eventLog.processed).toBe(false)

      // Mark as processed
      const processedLog = await prisma.eventLog.update({
        where: { id: eventLog.id },
        data: { processed: true },
      })

      expect(processedLog.processed).toBe(true)
    })

    it('should enforce unique [txHash, logIndex] constraint', async () => {
      const uniqueTxHash = `0x${(Date.now() + 21).toString(16)}${'0'.repeat(48)}`

      const eventLog1 = await prisma.eventLog.create({
        data: {
          eventType: 'ListingCreated',
          txHash: uniqueTxHash,
          blockNumber: 12345681,
          logIndex: 0,
          processed: false,
        },
      })

      createdEventLogIds.push(eventLog1.id)

      await expect(
        prisma.eventLog.create({
          data: {
            eventType: 'ListingCreated',
            txHash: uniqueTxHash, // Same tx
            blockNumber: 12345681,
            logIndex: 0, // Same log index
            processed: false,
          },
        })
      ).rejects.toThrow()
    })

    it('should query unprocessed events', async () => {
      const uniqueTxHash = `0x${(Date.now() + 22).toString(16)}${'0'.repeat(48)}`

      const eventLog = await prisma.eventLog.create({
        data: {
          eventType: 'Withdrawal',
          txHash: uniqueTxHash,
          blockNumber: 12345682,
          logIndex: 0,
          processed: false,
        },
      })

      createdEventLogIds.push(eventLog.id)

      const unprocessedEvents = await prisma.eventLog.findMany({
        where: {
          processed: false,
          id: { in: createdEventLogIds },
        },
      })

      expect(unprocessedEvents.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Database Connection Health', () => {
    it('should execute raw query successfully', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as test`
      expect(result).toBeDefined()
    })

    it('should report correct database time', async () => {
      const result = await prisma.$queryRaw<
        { now: Date }[]
      >`SELECT NOW() as now`
      expect(result[0].now).toBeInstanceOf(Date)
    })
  })
})

// Provide clear message when tests are skipped
describe.skipIf(!skipTests)('Database Integration Tests (SKIPPED)', () => {
  it('should skip when DATABASE_URL is not set', () => {
    // eslint-disable-next-line no-console
    console.log(
      'Integration tests skipped: DATABASE_URL not set.\n' +
        'To run: docker compose up -d postgres && ' +
        'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marketplace" pnpm test'
    )
    expect(true).toBe(true)
  })
})
