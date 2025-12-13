import { describe, it, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'

// ------------------------------------
// ENV (before app import)
// ------------------------------------
process.env.NODE_ENV = 'test'

// ------------------------------------
// Mocks
// ------------------------------------
vi.mock('../config/db.js', () => ({
  checkDatabaseHealth: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

vi.mock('../services/txVerification.js', () => ({
  verifyPurchase: vi.fn(),
}))

import app from '../index'
import { checkDatabaseHealth } from '../config/db.js'
import { verifyPurchase } from '../services/txVerification.js'

describe('index.ts (Express API)', () => {
  beforeAll(() => {
    vi.clearAllMocks()
  })

  // ---------------------------
  // HEALTH
  // ---------------------------
  it('GET /health → ok when DB healthy', async () => {
    ;(checkDatabaseHealth as any).mockResolvedValue(true)

    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.services.database).toBe('connected')
  })

  it('GET /health → degraded when DB down', async () => {
    ;(checkDatabaseHealth as any).mockResolvedValue(false)

    const res = await request(app).get('/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
  })

  // ---------------------------
  // VERIFY
  // ---------------------------
  it('POST /verify → success', async () => {
    ;(verifyPurchase as any).mockResolvedValue({
      listingId: 1,
      buyer: '0xbuyer',
      seller: '0xseller',
      amountUsdc: 100n,
      blockNumber: 10,
    })

    const res = await request(app).post('/verify').send({
      txHash: '0xtx',
      expectedListingId: 1,
      expectedBuyer: '0xbuyer',
    })

    expect(res.status).toBe(200)
    expect(res.body.data.amountUsdc).toBe('100')
  })

  it('POST /verify → handled error', async () => {
    ;(verifyPurchase as any).mockRejectedValue(new Error('boom'))

    const res = await request(app).post('/verify').send({
      txHash: '0xtx',
      expectedListingId: 1,
      expectedBuyer: '0xbuyer',
    })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal server error')
  })

  it('POST /verify hides error message in production', async () => {
    process.env.NODE_ENV = 'production'
    ;(verifyPurchase as any).mockRejectedValueOnce(new Error('boom'))


    const res = await request(app).post('/verify').send({
      txHash: '0xtx',
      expectedListingId: 1,
      expectedBuyer: '0xbuyer',
    })

    expect(res.status).toBe(500)
    expect(res.body.message).toBeUndefined()

    process.env.NODE_ENV = 'test'
  })

  // ---------------------------
  // FALLTHROUGHS
  // ---------------------------
  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })
})
