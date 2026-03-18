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

vi.mock('@/services/listingVerification', () => ({
  verifyListingCreation: vi.fn().mockResolvedValue({
    onchainId: 123,
    sellerAddress: '0x' + 'a'.repeat(40),
    dataCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    envelopeCid: 'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq',
    envelopeHash: '0x' + 'a'.repeat(64),
    priceUsdc: '10000000',
    blockNumber: 100,
  }),
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

const LISTING_ID = 'cklbqxp9c0000s0p7m0lhw1q3'

const makeDecimal = (value: string) => ({
  toString: () => value,
})

const baseListingSummary = {
  id: LISTING_ID,
  title: 'Test Listing',
  description: 'A valid listing description for tests.',
  category: 'AI/ML',
  priceUsdc: makeDecimal('10000000'),
  dataCid: VALID_CID,
  sellerAddress: SELLER_ADDRESS.toLowerCase(),
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  _count: { purchases: 2 },
}

const basePayload = {
  txHash: VALID_TX_HASH,
  dataCid: VALID_CID,
  envelopeCid: VALID_ENVELOPE_CID,
  envelopeHash: VALID_BYTES32,
  title: 'Listing Title',
  description: 'A valid description that is long enough for validation.',
  category: 'AI/ML',
  priceUsdc: '10000000',
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

  it('returns listings with salesCount', async () => {
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
    expect(res.body.listings[0].priceUsdc).toBe('10')
  })
})

describe('POST /api/listings', () => {
  it('creates a listing with valid auth', async () => {
    mockListingCreate.mockResolvedValue({
      id: LISTING_ID,
      onchainId: 123,
      sellerAddress: SELLER_ADDRESS.toLowerCase(),
      title: basePayload.title,
      description: basePayload.description,
      category: basePayload.category,
      priceUsdc: makeDecimal('10000000'),
      createdAt: new Date(),
    })

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
      .send(basePayload)

    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe(LISTING_ID)
  })

  it('rejects missing auth header', async () => {
    const res = await request(app).post('/api/listings').send(basePayload)

    expect(res.status).toBe(401)
  })

  it('rejects expired signature', async () => {
    const expired = Math.floor(Date.now() / 1000) - 600

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS, expired))
      .send(basePayload)

    expect(res.status).toBe(401)
  })

  it('returns 409 on duplicate listing', async () => {
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
  })

  it.each([
    ['invalid txHash', { ...basePayload, txHash: '0x123' }],
    ['invalid dataCid', { ...basePayload, dataCid: 'bad-cid' }],
    ['invalid envelopeCid', { ...basePayload, envelopeCid: 'bad-cid' }],
    ['invalid envelopeHash', { ...basePayload, envelopeHash: '0x123' }],
    ['short title', { ...basePayload, title: 'aa' }],
    ['short description', { ...basePayload, description: 'short' }],
    ['invalid category', { ...basePayload, category: 'Invalid' }],
    ['invalid priceUsdc', { ...basePayload, priceUsdc: 'abc' }],
  ])('rejects payload with %s', async (_label, payload) => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
      .send(payload)

    expect(res.status).toBe(400)
  })
})
