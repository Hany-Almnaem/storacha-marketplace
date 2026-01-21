import { Prisma } from '@prisma/client'
import request from 'supertest'
import { verifyMessage } from 'viem'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest'

import app from '../index'

process.env.NODE_ENV = 'test'

const mocks = vi.hoisted(() => ({
  listingFindMany: vi.fn(),
  listingGroupBy: vi.fn(),
  listingFindUnique: vi.fn(),
  listingCreate: vi.fn(),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    verifyMessage: vi.fn(),
  }
})

vi.mock('../config/db.js', () => {
  const prisma = {
    listing: {
      findMany: mocks.listingFindMany,
      groupBy: mocks.listingGroupBy,
      findUnique: mocks.listingFindUnique,
      create: mocks.listingCreate,
    },
  }

  return {
    prisma,
    default: prisma,
    checkDatabaseHealth: vi.fn().mockResolvedValue(true),
    disconnectDatabase: vi.fn(),
  }
})

const mockVerifyMessage = verifyMessage as MockedFunction<typeof verifyMessage>
const mockListingFindMany = mocks.listingFindMany
const mockListingGroupBy = mocks.listingGroupBy
const mockListingFindUnique = mocks.listingFindUnique
const mockListingCreate = mocks.listingCreate

const VALID_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const VALID_ENVELOPE_CID =
  'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'
const VALID_BYTES32 = '0x' + 'a'.repeat(64)
const VALID_SIGNATURE = '0x' + 'b'.repeat(130)
const VALID_TX_HASH = '0x' + 'c'.repeat(64)

const SELLER_ADDRESS = '0x' + 'A'.repeat(40)
const OTHER_ADDRESS = '0x' + 'B'.repeat(40)

const LISTING_ID = 'cklbqxp9c0000s0p7m0lhw1q3'
const LISTING_ID_2 = 'cklbqxp9c0000s0p7m0lhw1q4'
const LISTING_ID_3 = 'cklbqxp9c0000s0p7m0lhw1q5'

const makeDecimal = (value: string) => ({
  toString: () => value,
})

const baseListingSummary = {
  id: LISTING_ID,
  title: 'Test Listing',
  description: 'A valid listing description for tests.',
  category: 'AI/ML',
  priceUsdc: makeDecimal('10.00'),
  dataCid: VALID_CID,
  sellerAddress: SELLER_ADDRESS.toLowerCase(),
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  _count: { purchases: 2 },
}

const basePurchase = {
  id: 'purchase-id',
  buyerAddress: OTHER_ADDRESS.toLowerCase(),
  txHash: VALID_TX_HASH,
  amountUsdc: makeDecimal('5.00'),
  txVerified: true,
  blockNumber: 123,
  buyerPublicKey: 'buyer-key',
  publicKeySignature: 'buyer-sig',
  keyCid: VALID_CID,
  keyDelivered: true,
  keyDeliveredAt: new Date('2024-01-03T00:00:00.000Z'),
  createdAt: new Date('2024-01-03T00:00:00.000Z'),
  updatedAt: new Date('2024-01-04T00:00:00.000Z'),
}

const baseListingDetail = {
  ...baseListingSummary,
  onchainId: 42,
  envelopeCid: VALID_ENVELOPE_CID,
  envelopeHash: VALID_BYTES32,
  active: true,
  origFilename: 'data.csv',
  contentType: 'text/csv',
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  purchases: [basePurchase],
  _count: { purchases: 1 },
}

const basePayload = {
  onchainId: 123,
  sellerAddress: SELLER_ADDRESS,
  dataCid: VALID_CID,
  envelopeCid: VALID_ENVELOPE_CID,
  envelopeHash: VALID_BYTES32,
  title: 'Listing Title',
  description: 'A valid description that is long enough for validation.',
  category: 'AI/ML',
  priceUsdc: '10.00',
  origFilename: 'data.csv',
  contentType: 'text/csv',
}

function buildAuthHeader(address: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  return `Signature ${address}:${ts}:${VALID_SIGNATURE}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListingFindMany.mockResolvedValue([])
  mockListingGroupBy.mockResolvedValue([])
  mockListingFindUnique.mockResolvedValue(null)
  mockListingCreate.mockResolvedValue({ id: LISTING_ID })
  mockVerifyMessage.mockResolvedValue(true)
})

describe('GET /api/listings', () => {
  it('returns empty results with default pagination', async () => {
    const res = await request(app).get('/api/listings')

    expect(res.status).toBe(200)
    expect(res.body.listings).toEqual([])
    expect(res.body.nextCursor).toBeNull()
    expect(res.body.categories).toEqual({})
  })

  it('returns listings with salesCount and omits sensitive fields', async () => {
    mockListingFindMany.mockResolvedValue([
      {
        ...baseListingSummary,
        _count: { purchases: 3 },
      },
    ])

    const res = await request(app).get('/api/listings')

    expect(res.status).toBe(200)
    expect(res.body.listings).toHaveLength(1)
    expect(res.body.listings[0].salesCount).toBe(3)
    expect(res.body.listings[0].priceUsdc).toBe('10.00')
    expect(res.body.listings[0].envelopeCid).toBeUndefined()
    expect(res.body.listings[0].envelopeHash).toBeUndefined()
    expect(res.body.listings[0].onchainId).toBeUndefined()
  })

  it('paginates results with nextCursor', async () => {
    mockListingFindMany.mockResolvedValue([
      { ...baseListingSummary, id: LISTING_ID },
      { ...baseListingSummary, id: LISTING_ID_2 },
      { ...baseListingSummary, id: LISTING_ID_3 },
    ])

    const res = await request(app).get('/api/listings?limit=2')

    const query = mockListingFindMany.mock.calls[0]?.[0] as any
    expect(res.status).toBe(200)
    expect(res.body.listings).toHaveLength(2)
    expect(res.body.nextCursor).toBe(LISTING_ID_3)
    expect(query.take).toBe(3)
  })

  it('paginates results without nextCursor when exhausted', async () => {
    mockListingFindMany.mockResolvedValue([{ ...baseListingSummary }])

    const res = await request(app).get('/api/listings?limit=2')

    expect(res.status).toBe(200)
    expect(res.body.listings).toHaveLength(1)
    expect(res.body.nextCursor).toBeNull()
  })

  it('applies category filter and active listings constraint', async () => {
    await request(app).get('/api/listings?category=AI/ML')

    const query = mockListingFindMany.mock.calls[0]?.[0] as any
    expect(query.where.category).toBe('AI/ML')
    expect(query.where.active).toBe(true)
  })

  it('applies cursor filter', async () => {
    await request(app).get(`/api/listings?cursor=${LISTING_ID}`)

    const query = mockListingFindMany.mock.calls[0]?.[0] as any
    expect(query.where.id).toEqual({ gt: LISTING_ID })
  })

  it('applies price range filters', async () => {
    await request(app).get('/api/listings?minPrice=10.00&maxPrice=20.00')

    const query = mockListingFindMany.mock.calls[0]?.[0] as any
    expect(query.where.priceUsdc).toEqual({ gte: '10.00', lte: '20.00' })
  })

  it('lowercases seller filter', async () => {
    await request(app).get(`/api/listings?seller=${SELLER_ADDRESS}`)

    const query = mockListingFindMany.mock.calls[0]?.[0] as any
    expect(query.where.sellerAddress).toBe(SELLER_ADDRESS.toLowerCase())
  })

  it('returns category counts', async () => {
    mockListingGroupBy.mockResolvedValue([
      { category: 'AI/ML', _count: { _all: 2 } },
      { category: 'IoT', _count: { _all: 1 } },
    ])

    const res = await request(app).get('/api/listings')

    expect(res.status).toBe(200)
    expect(res.body.categories).toEqual({ 'AI/ML': 2, IoT: 1 })
  })

  it('rejects invalid query parameters', async () => {
    const res = await request(app).get('/api/listings?cursor=bad')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation failed')
    expect(Array.isArray(res.body.details)).toBe(true)
  })
})

describe('GET /api/listings/:id', () => {
  it('returns 404 when listing not found', async () => {
    mockListingFindUnique.mockResolvedValue(null)

    const res = await request(app).get('/api/listings/missing')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Listing not found')
  })

  it('returns public listing details', async () => {
    mockListingFindUnique.mockResolvedValue(baseListingDetail)

    const res = await request(app).get(`/api/listings/${LISTING_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.listing.envelopeCid).toBe(VALID_ENVELOPE_CID)
    expect(res.body.listing.envelopeHash).toBeUndefined()
    expect(res.body.listing.onchainId).toBeUndefined()
    expect(res.body.listing.purchases).toBeUndefined()
    expect(res.body.listing.salesCount).toBe(1)
  })

  it('returns seller view with sensitive fields and purchases', async () => {
    mockListingFindUnique.mockResolvedValue(baseListingDetail)

    const res = await request(app)
      .get(`/api/listings/${LISTING_ID}`)
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS))

    expect(res.status).toBe(200)
    expect(res.body.listing.onchainId).toBe(42)
    expect(res.body.listing.envelopeHash).toBe(VALID_BYTES32)
    expect(res.body.listing.purchases).toHaveLength(1)
    expect(res.body.listing.purchases[0].amountUsdc).toBe('5.00')
  })
})

describe('POST /api/listings', () => {
  it('creates a listing with valid auth', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
      .send(basePayload)

    const createArgs = mockListingCreate.mock.calls[0]?.[0] as any

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(LISTING_ID)
    expect(res.body.message).toBe('Listing created successfully')
    expect(createArgs.data.sellerAddress).toBe(SELLER_ADDRESS.toLowerCase())
  })

  it('rejects missing auth header', async () => {
    const res = await request(app).post('/api/listings').send(basePayload)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing authorization header')
  })

  it('rejects expired signature', async () => {
    const expired = Math.floor(Date.now() / 1000) - 600

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS, expired))
      .send(basePayload)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Signature expired')
  })

  it('rejects when signature does not match seller', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(OTHER_ADDRESS))
      .send({ ...basePayload, sellerAddress: SELLER_ADDRESS })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Signature does not match seller')
  })

  it('returns 409 on duplicate onchainId', async () => {
    mockListingCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      })
    )

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
      .send(basePayload)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Listing already exists')
  })

  it.each([
    ['invalid onchainId', { ...basePayload, onchainId: 0 }],
    ['invalid dataCid', { ...basePayload, dataCid: 'bad-cid' }],
    ['invalid envelopeCid', { ...basePayload, envelopeCid: 'bad-cid' }],
    ['invalid envelopeHash', { ...basePayload, envelopeHash: '0x123' }],
    ['short title', { ...basePayload, title: 'aa' }],
    ['short description', { ...basePayload, description: 'short' }],
    ['invalid category', { ...basePayload, category: 'Invalid' }],
    ['invalid priceUsdc', { ...basePayload, priceUsdc: 'abc' }],
    ['invalid sellerAddress', { ...basePayload, sellerAddress: '0x123' }],
  ])('rejects payload with %s', async (_label, payload) => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
      .send(payload)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation failed')
    expect(Array.isArray(res.body.details)).toBe(true)
  })
})
