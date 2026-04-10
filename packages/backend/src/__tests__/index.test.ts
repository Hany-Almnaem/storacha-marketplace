import request from 'supertest'
import { describe, it, expect, vi, beforeAll } from 'vitest'

process.env.NODE_ENV = 'test'

const VALID_TX_HASH = '0x' + 'a'.repeat(64)
const VALID_ADDRESS = '0x' + 'b'.repeat(40)

// --------------------
// Mocks
// --------------------
vi.mock('../config/db.js', () => ({
  checkDatabaseHealth: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

vi.mock('../config/chain.js', () => ({
  checkChainHealth: vi.fn(),
}))

vi.mock('../services/txVerification.js', () => ({
  verifyPurchase: vi.fn(),
}))

vi.mock('../services/monitoring.js', () => ({
  getListenerHealth: vi.fn().mockResolvedValue({
    healthy: true,
    stale: false,
    lastBlock: 100,
  }),
}))

import { checkChainHealth } from '../config/chain.js'
import { checkDatabaseHealth } from '../config/db.js'
import app from '../index'
import { getListenerHealth } from '../services/monitoring.js'
import { verifyPurchase } from '../services/txVerification.js'

describe('index.ts (Express API)', () => {
  beforeAll(() => {
    vi.clearAllMocks()
  })

  it('GET /health → ok when everything is fine', async () => {
    ;(checkDatabaseHealth as any).mockResolvedValue(true)
    ;(checkChainHealth as any).mockResolvedValue(12345)
    ;(getListenerHealth as any).mockResolvedValue({
      healthy: true,
      stale: false,
      lastBlock: 100,
    })

    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.services.database).toBe('connected')
    expect(res.body.services.rpc).toBe('ok')
  })

  it('GET /health → 503 when DB down', async () => {
    ;(checkDatabaseHealth as any).mockResolvedValue(false)
    ;(checkChainHealth as any).mockResolvedValue(12345)
    ;(getListenerHealth as any).mockResolvedValue({ stale: false })

    const res = await request(app).get('/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.services.database).toBe('disconnected')
  })

  it('GET /health → 503 when RPC down', async () => {
    ;(checkDatabaseHealth as any).mockResolvedValue(true)
    ;(checkChainHealth as any).mockResolvedValue(null)
    ;(getListenerHealth as any).mockResolvedValue({ stale: false })

    const res = await request(app).get('/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.services.rpc).toBe('degraded')
  })

  it('GET /health → 503 when Listener stale', async () => {
    ;(checkDatabaseHealth as any).mockResolvedValue(true)
    ;(checkChainHealth as any).mockResolvedValue(12345)
    ;(getListenerHealth as any).mockResolvedValue({ stale: true })

    const res = await request(app).get('/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
  })

  it('POST /verify → success', async () => {
    ;(verifyPurchase as any).mockResolvedValue({
      listingId: 1,
      buyer: VALID_ADDRESS,
      seller: VALID_ADDRESS,
      amountUsdc: 100n,
      blockNumber: 10,
    })

    const res = await request(app).post('/verify').send({
      txHash: VALID_TX_HASH,
      expectedListingId: 1,
      expectedBuyer: VALID_ADDRESS,
    })

    expect(res.status).toBe(200)
    expect(res.body.data.amountUsdc).toBe('100')
  })

  it('POST /verify → validation error', async () => {
    const res = await request(app).post('/verify').send({
      txHash: 'bad',
    })

    expect(res.status).toBe(400)
  })

  it('POST /verify → handled error', async () => {
    ;(verifyPurchase as any).mockRejectedValue(new Error('boom'))

    const res = await request(app).post('/verify').send({
      txHash: VALID_TX_HASH,
      expectedListingId: 1,
      expectedBuyer: VALID_ADDRESS,
    })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal server error')
  })

  it('POST /verify hides error message in production', async () => {
    process.env.NODE_ENV = 'production'
    ;(verifyPurchase as any).mockRejectedValueOnce(new Error('secret'))

    const res = await request(app).post('/verify').send({
      txHash: VALID_TX_HASH,
      expectedListingId: 1,
      expectedBuyer: VALID_ADDRESS,
    })

    expect(res.status).toBe(500)
    expect(res.body.message).toBeUndefined()

    process.env.NODE_ENV = 'test'
  })

  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })
})
