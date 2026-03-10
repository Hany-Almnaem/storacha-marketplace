/**
 * Integration tests for database operations.
 */

import { PrismaClient } from '@prisma/client'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const TEST_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const TEST_ENVELOPE_CID =
  'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'
const TEST_ENVELOPE_HASH =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

const TEST_SELLER_ADDRESS = '0x1111111111111111111111111111111111111111'
const TEST_BUYER_ADDRESS = '0x2222222222222222222222222222222222222222'

const DATABASE_URL = process.env['DATABASE_URL']
const skipTests = !DATABASE_URL

let prisma: PrismaClient

const createdListingIds: string[] = []
const createdPurchaseIds: string[] = []
const createdEventLogIds: string[] = []

const usdc = (amount: number) => (amount * 1_000_000).toString()

const uniqueId = () =>
  Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000)

const txHash = () =>
  `0x${Date.now().toString(16)}${Math.random()
    .toString(16)
    .slice(2)
    .padEnd(48, '0')}`

describe.skipIf(skipTests)('Database Integration Tests', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    })

    await prisma.$connect()
  })

  afterAll(async () => {
    if (createdPurchaseIds.length) {
      await prisma.purchase.deleteMany({
        where: { id: { in: createdPurchaseIds } },
      })
    }

    if (createdListingIds.length) {
      await prisma.listing.deleteMany({
        where: { id: { in: createdListingIds } },
      })
    }

    if (createdEventLogIds.length) {
      await prisma.eventLog.deleteMany({
        where: { id: { in: createdEventLogIds } },
      })
    }

    await prisma.$disconnect()
  })

  describe('Listing CRUD Operations', () => {
    it('should create a listing with required fields', async () => {
      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueId(),
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Integration Test Dataset',
          description: 'Test dataset for integration tests',
          category: 'AI/ML',
          priceUsdc: usdc(10),
          active: true,
          txHash: txHash(),
        },
      })

      createdListingIds.push(listing.id)

      expect(listing.id).toBeDefined()
      expect(listing.priceUsdc.toString()).toBe(usdc(10))
    })

    it('should enforce unique onchainId', async () => {
      const id = uniqueId()

      const first = await prisma.listing.create({
        data: {
          onchainId: id,
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'First Listing',
          description: 'First listing test',
          category: 'Finance',
          priceUsdc: usdc(50),
          txHash: txHash(),
        },
      })

      createdListingIds.push(first.id)

      await expect(
        prisma.listing.create({
          data: {
            onchainId: id,
            sellerAddress: TEST_SELLER_ADDRESS,
            dataCid: TEST_CID,
            envelopeCid: TEST_ENVELOPE_CID,
            envelopeHash: TEST_ENVELOPE_HASH,
            title: 'Duplicate',
            description: 'Should fail',
            category: 'Finance',
            priceUsdc: usdc(50),
            txHash: txHash(),
          },
        })
      ).rejects.toThrow()
    })

    it('should update listing status', async () => {
      const listing = await prisma.listing.create({
        data: {
          onchainId: uniqueId(),
          sellerAddress: TEST_SELLER_ADDRESS,
          dataCid: TEST_CID,
          envelopeCid: TEST_ENVELOPE_CID,
          envelopeHash: TEST_ENVELOPE_HASH,
          title: 'Deactivate Test',
          description: 'Deactivate listing test',
          category: 'Other',
          priceUsdc: usdc(5),
          active: true,
          txHash: txHash(),
        },
      })

      createdListingIds.push(listing.id)

      const updated = await prisma.listing.update({
        where: { id: listing.id },
        data: { active: false },
      })

      expect(updated.active).toBe(false)
    })
  })
})
