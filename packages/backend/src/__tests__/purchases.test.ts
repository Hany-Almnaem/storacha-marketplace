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
  purchaseFindMany: vi.fn(),
  purchaseFindUnique: vi.fn(),
  purchaseUpdate: vi.fn(),
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
    purchase: {
      findMany: mocks.purchaseFindMany,
      findUnique: mocks.purchaseFindUnique,
      update: mocks.purchaseUpdate,
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
const mockPurchaseFindMany = mocks.purchaseFindMany
const mockPurchaseFindUnique = mocks.purchaseFindUnique
const mockPurchaseUpdate = mocks.purchaseUpdate

const VALID_SIGNATURE = '0x' + 'a'.repeat(130)
const VALID_TX_HASH = '0x' + 'b'.repeat(64)
const VALID_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const VALID_ENVELOPE_CID =
  'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'
const VALID_KEY_CID =
  'bafybeihkoviema7g3gxyt6la7vd5ho32dq3gflscys2c3al3lmqvypa4ee'
const BUYER_ADDRESS = '0x' + 'A'.repeat(40)
const SELLER_ADDRESS = '0x' + 'B'.repeat(40)
const OTHER_ADDRESS = '0x' + 'C'.repeat(40)

const PURCHASE_ID = 'cklbqxp9c0000s0p7m0lhw1q3'
const PURCHASE_ID_2 = 'cklbqxp9c0000s0p7m0lhw1q4'
const PURCHASE_ID_3 = 'cklbqxp9c0000s0p7m0lhw1q5'
const LISTING_ID = 'cklbqxp9c0000s0p7m0lhw1q6'

const PUBLIC_KEY = '{"kty":"RSA","n":"abc","e":"AQAB"}'
const PUBLIC_KEY_SIGNATURE = '0x' + 'd'.repeat(130)

const makeDecimal = (value: string) => ({
  toString: () => value,
})

const baseListing = {
  id: LISTING_ID,
  title: 'Dataset Title',
  category: 'AI/ML',
  priceUsdc: makeDecimal('10.00'),
  sellerAddress: SELLER_ADDRESS.toLowerCase(),
  dataCid: VALID_CID,
  envelopeCid: VALID_ENVELOPE_CID,
}

const basePurchaseSummary = {
  id: PURCHASE_ID,
  listing: baseListing,
  txHash: VALID_TX_HASH,
  amountUsdc: makeDecimal('10.00'),
  txVerified: true,
  buyerPublicKey: null,
  keyDelivered: false,
  keyCid: null,
  createdAt: new Date('2024-01-15T00:00:00.000Z'),
}

const basePendingPurchase = {
  id: PURCHASE_ID,
  buyerAddress: BUYER_ADDRESS,
  buyerPublicKey: PUBLIC_KEY,
  listing: {
    id: LISTING_ID,
    title: 'Dataset Title',
    onchainId: 42,
  },
  txHash: VALID_TX_HASH,
  amountUsdc: makeDecimal('10.00'),
  createdAt: new Date('2024-01-15T00:00:00.000Z'),
}

function buildAuthHeader(address: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  return `Signature ${address}:${ts}:${VALID_SIGNATURE}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPurchaseFindMany.mockResolvedValue([])
  mockPurchaseFindUnique.mockResolvedValue(null)
  mockPurchaseUpdate.mockResolvedValue({})
  mockVerifyMessage.mockResolvedValue(true)
})

describe('purchases API', () => {
  describe('auth', () => {
    it('rejects missing auth header', async () => {
      const res = await request(app).get('/api/purchases')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Missing authorization header')
    })

    it('rejects expired signature', async () => {
      const expired = Math.floor(Date.now() / 1000) - 600

      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS, expired))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Signature expired')
    })

    it('rejects invalid signature', async () => {
      mockVerifyMessage.mockResolvedValue(false)

      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid signature')
    })
  })

  describe('GET /api/purchases', () => {
    it('returns empty results with default pagination', async () => {
      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      const query = mockPurchaseFindMany.mock.calls[0]?.[0] as any

      expect(res.status).toBe(200)
      expect(res.body.purchases).toEqual([])
      expect(res.body.nextCursor).toBeNull()
      expect(query.where.buyerAddress).toEqual({
        equals: BUYER_ADDRESS.toLowerCase(),
        mode: 'insensitive',
      })
    })

    it('sets no-cache headers', async () => {
      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['vary']).toContain('Authorization')
    })

    it('applies cursor filter', async () => {
      await request(app)
        .get(`/api/purchases?cursor=${PURCHASE_ID}`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      const query = mockPurchaseFindMany.mock.calls[0]?.[0] as any

      expect(query.where.id).toEqual({ gt: PURCHASE_ID })
    })

    it('paginates results with nextCursor', async () => {
      mockPurchaseFindMany.mockResolvedValue([
        { ...basePurchaseSummary, id: PURCHASE_ID },
        { ...basePurchaseSummary, id: PURCHASE_ID_2 },
        { ...basePurchaseSummary, id: PURCHASE_ID_3 },
      ])

      const res = await request(app)
        .get('/api/purchases?limit=2')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      const query = mockPurchaseFindMany.mock.calls[0]?.[0] as any

      expect(res.status).toBe(200)
      expect(res.body.purchases).toHaveLength(2)
      expect(res.body.nextCursor).toBe(PURCHASE_ID_3)
      expect(query.take).toBe(3)
    })

    it('includes listing details and pricing', async () => {
      mockPurchaseFindMany.mockResolvedValue([basePurchaseSummary])

      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(200)
      expect(res.body.purchases).toHaveLength(1)
      expect(res.body.purchases[0].listing.title).toBe('Dataset Title')
      expect(res.body.purchases[0].listing.category).toBe('AI/ML')
      expect(res.body.purchases[0].listing.priceUsdc).toBe('10.00')
      expect(res.body.purchases[0].listing.envelopeCid).toBe(VALID_ENVELOPE_CID)
      expect(res.body.purchases[0].amountUsdc).toBe('10.00')
      expect(res.body.purchases[0].txVerified).toBe(true)
    })

    it('rejects invalid query parameters', async () => {
      const res = await request(app)
        .get('/api/purchases?cursor=bad')
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(Array.isArray(res.body.details)).toBe(true)
    })
  })

  describe('POST /api/purchases/:id/bind-key', () => {
    it('binds public key for valid buyer with ms timestamp', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: null,
      })

      const bindTimestamp = Date.now() - 1000
      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: bindTimestamp,
        })

      const updateArgs = mockPurchaseUpdate.mock.calls[0]?.[0] as any
      const bindCall = mockVerifyMessage.mock.calls[1]?.[0] as any
      const encodedKey = Buffer.from(PUBLIC_KEY, 'utf8').toString('base64')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Public key bound successfully')
      expect(updateArgs.where.id).toBe(PURCHASE_ID)
      expect(updateArgs.data.buyerPublicKey).toBe(PUBLIC_KEY)
      expect(updateArgs.data.publicKeySignature).toBe(PUBLIC_KEY_SIGNATURE)
      expect(bindCall.address).toBe(BUYER_ADDRESS.toLowerCase())
      expect(bindCall.message).toContain(encodedKey)
      expect(bindCall.message).toContain(`Timestamp: ${bindTimestamp}`)
    })

    it('returns 404 when purchase not found', async () => {
      mockPurchaseFindUnique.mockResolvedValueOnce(null)

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: Math.floor(Date.now() / 1000),
        })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Purchase not found')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects wrong buyer', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: OTHER_ADDRESS.toLowerCase(),
        buyerPublicKey: null,
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: Math.floor(Date.now() / 1000),
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects invalid payload', async () => {
      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: '',
          signature: '',
          timestamp: 0,
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(Array.isArray(res.body.details)).toBe(true)
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects invalid signature', async () => {
      mockVerifyMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: null,
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: Math.floor(Date.now() / 1000),
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid signature')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects future timestamp', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: null,
      })

      const future = Math.floor(Date.now() / 1000) + 600

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: future,
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Signature expired')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects expired timestamp', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: null,
      })

      const expired = Math.floor(Date.now() / 1000) - 600

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: expired,
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Signature expired')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects already bound keys', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: PUBLIC_KEY,
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/bind-key`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))
        .send({
          publicKey: PUBLIC_KEY,
          signature: PUBLIC_KEY_SIGNATURE,
          timestamp: Math.floor(Date.now() / 1000),
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Public key already bound')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/purchases/:id/key', () => {
    it('delivers key for valid seller', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: PUBLIC_KEY,
        keyDelivered: false,
        keyCid: null,
        listing: {
          sellerAddress: SELLER_ADDRESS,
        },
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/key`)
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
        .send({ keyCid: VALID_KEY_CID })

      const updateArgs = mockPurchaseUpdate.mock.calls[0]?.[0] as any

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Key delivered successfully')
      expect(updateArgs.where.id).toBe(PURCHASE_ID)
      expect(updateArgs.data.keyCid).toBe(VALID_KEY_CID)
      expect(updateArgs.data.keyDelivered).toBe(true)
      expect(updateArgs.data.keyDeliveredAt).toBeInstanceOf(Date)
    })

    it('returns 404 when purchase not found', async () => {
      mockPurchaseFindUnique.mockResolvedValueOnce(null)

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/key`)
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
        .send({ keyCid: VALID_KEY_CID })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Purchase not found')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects wrong seller', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: PUBLIC_KEY,
        keyDelivered: false,
        keyCid: null,
        listing: {
          sellerAddress: SELLER_ADDRESS,
        },
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/key`)
        .set('Authorization', buildAuthHeader(OTHER_ADDRESS))
        .send({ keyCid: VALID_KEY_CID })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects missing buyer public key', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: null,
        keyDelivered: false,
        keyCid: null,
        listing: {
          sellerAddress: SELLER_ADDRESS,
        },
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/key`)
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
        .send({ keyCid: VALID_KEY_CID })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Buyer public key not bound')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects invalid keyCid', async () => {
      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/key`)
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
        .send({ keyCid: 'bad-cid' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(Array.isArray(res.body.details)).toBe(true)
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })

    it('rejects already delivered key', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        buyerPublicKey: PUBLIC_KEY,
        keyDelivered: true,
        keyCid: VALID_KEY_CID,
        listing: {
          sellerAddress: SELLER_ADDRESS,
        },
      })

      const res = await request(app)
        .post(`/api/purchases/${PURCHASE_ID}/key`)
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))
        .send({ keyCid: VALID_KEY_CID })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Key already delivered')
      expect(mockPurchaseUpdate).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/purchases/:id/access', () => {
    it('returns access CIDs for buyer', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        keyDelivered: true,
        keyCid: VALID_KEY_CID,
        listing: {
          dataCid: VALID_CID,
          envelopeCid: VALID_ENVELOPE_CID,
        },
      })

      const res = await request(app)
        .get(`/api/purchases/${PURCHASE_ID}/access`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(200)
      expect(res.body.dataCid).toBe(VALID_CID)
      expect(res.body.envelopeCid).toBe(VALID_ENVELOPE_CID)
      expect(res.body.keyCid).toBe(VALID_KEY_CID)
    })

    it('sets no-cache headers', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        keyDelivered: true,
        keyCid: VALID_KEY_CID,
        listing: {
          dataCid: VALID_CID,
          envelopeCid: VALID_ENVELOPE_CID,
        },
      })

      const res = await request(app)
        .get(`/api/purchases/${PURCHASE_ID}/access`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['vary']).toContain('Authorization')
    })

    it('returns 404 when purchase not found', async () => {
      mockPurchaseFindUnique.mockResolvedValueOnce(null)

      const res = await request(app)
        .get(`/api/purchases/${PURCHASE_ID}/access`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Purchase not found')
    })

    it('rejects wrong buyer', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: OTHER_ADDRESS.toLowerCase(),
        keyDelivered: true,
        keyCid: VALID_KEY_CID,
        listing: {
          dataCid: VALID_CID,
          envelopeCid: VALID_ENVELOPE_CID,
        },
      })

      const res = await request(app)
        .get(`/api/purchases/${PURCHASE_ID}/access`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })

    it('returns 404 when key not delivered', async () => {
      mockPurchaseFindUnique.mockResolvedValue({
        id: PURCHASE_ID,
        buyerAddress: BUYER_ADDRESS.toLowerCase(),
        keyDelivered: false,
        keyCid: null,
        listing: {
          dataCid: VALID_CID,
          envelopeCid: VALID_ENVELOPE_CID,
        },
      })

      const res = await request(app)
        .get(`/api/purchases/${PURCHASE_ID}/access`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Key not delivered yet')
    })

    it('handles unexpected errors', async () => {
      mockPurchaseFindUnique.mockRejectedValueOnce(new Error('boom'))

      const res = await request(app)
        .get(`/api/purchases/${PURCHASE_ID}/access`)
        .set('Authorization', buildAuthHeader(BUYER_ADDRESS))

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
    })
  })

  describe('GET /api/seller/pending-deliveries', () => {
    it('returns pending deliveries with pagination', async () => {
      mockPurchaseFindMany.mockResolvedValue([
        { ...basePendingPurchase, id: PURCHASE_ID },
        { ...basePendingPurchase, id: PURCHASE_ID_2 },
        { ...basePendingPurchase, id: PURCHASE_ID_3 },
      ])

      const res = await request(app)
        .get('/api/seller/pending-deliveries?limit=2')
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))

      const query = mockPurchaseFindMany.mock.calls[0]?.[0] as any

      expect(res.status).toBe(200)
      expect(res.body.purchases).toHaveLength(2)
      expect(res.body.purchases[0].buyerAddress).toBe(
        BUYER_ADDRESS.toLowerCase()
      )
      expect(res.body.nextCursor).toBe(PURCHASE_ID_3)
      expect(query.where.keyDelivered).toBe(false)
      expect(query.where.buyerPublicKey).toEqual({ not: null })
      expect(query.where.listing.sellerAddress).toEqual({
        equals: SELLER_ADDRESS.toLowerCase(),
        mode: 'insensitive',
      })
    })

    it('rejects invalid query parameters', async () => {
      const res = await request(app)
        .get('/api/seller/pending-deliveries?cursor=bad')
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(Array.isArray(res.body.details)).toBe(true)
    })

    it('sets no-cache headers', async () => {
      mockPurchaseFindMany.mockResolvedValue([basePendingPurchase])

      const res = await request(app)
        .get('/api/seller/pending-deliveries')
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))

      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['vary']).toContain('Authorization')
    })

    it('includes listing metadata for seller delivery', async () => {
      mockPurchaseFindMany.mockResolvedValue([basePendingPurchase])

      const res = await request(app)
        .get('/api/seller/pending-deliveries')
        .set('Authorization', buildAuthHeader(SELLER_ADDRESS))

      expect(res.status).toBe(200)
      expect(res.body.purchases[0].listing.onchainId).toBe(42)
      expect(res.body.purchases[0].amountUsdc).toBe('10.00')
    })
  })
})
