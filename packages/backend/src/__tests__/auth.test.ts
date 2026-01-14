import express from 'express'
import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  optionalAuth,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.js'

const mocks = vi.hoisted(() => ({
  verifyMessage: vi.fn(),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    verifyMessage: mocks.verifyMessage,
  }
})

const VALID_SIGNATURE = '0x' + 'a'.repeat(130)
const VALID_ADDRESS = '0x' + 'A'.repeat(40)
const INVALID_ADDRESS = '0x123'

function buildAuthHeader(address: string, timestamp: number): string {
  return `Signature ${address}:${timestamp}:${VALID_SIGNATURE}`
}

function buildApp() {
  const app = express()
  app.get('/optional', optionalAuth, (req, res) => {
    const walletAddress = (req as AuthenticatedRequest).walletAddress ?? null
    res.json({ walletAddress })
  })
  app.get('/required', requireAuth, (req, res) => {
    const walletAddress = (req as AuthenticatedRequest).walletAddress ?? null
    res.json({ walletAddress })
  })
  return app
}

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyMessage.mockResolvedValue(true)
  })

  describe('optionalAuth', () => {
    it('allows requests without header', async () => {
      const app = buildApp()

      const res = await request(app).get('/optional')

      expect(res.status).toBe(200)
      expect(res.body.walletAddress).toBeNull()
      expect(mocks.verifyMessage).not.toHaveBeenCalled()
    })

    it('attaches walletAddress for valid signature', async () => {
      const app = buildApp()
      const timestamp = Math.floor(Date.now() / 1000)

      const res = await request(app)
        .get('/optional')
        .set('Authorization', buildAuthHeader(VALID_ADDRESS, timestamp))

      expect(res.status).toBe(200)
      expect(res.body.walletAddress).toBe(VALID_ADDRESS.toLowerCase())
    })

    it('rejects invalid header format', async () => {
      const app = buildApp()

      const res = await request(app)
        .get('/optional')
        .set('Authorization', 'BadHeader')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid authorization header')
    })

    it('rejects expired timestamp', async () => {
      const app = buildApp()
      const expired = Math.floor(Date.now() / 1000) - 600

      const res = await request(app)
        .get('/optional')
        .set('Authorization', buildAuthHeader(VALID_ADDRESS, expired))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Signature expired')
    })

    it('rejects invalid signature', async () => {
      const app = buildApp()
      const timestamp = Math.floor(Date.now() / 1000)
      mocks.verifyMessage.mockResolvedValue(false)

      const res = await request(app)
        .get('/optional')
        .set('Authorization', buildAuthHeader(VALID_ADDRESS, timestamp))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid signature')
    })
  })

  describe('requireAuth', () => {
    it('rejects missing header', async () => {
      const app = buildApp()

      const res = await request(app).get('/required')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Missing authorization header')
    })

    it('rejects invalid header format', async () => {
      const app = buildApp()

      const res = await request(app)
        .get('/required')
        .set('Authorization', 'BadHeader')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid authorization header')
    })

    it('rejects invalid address', async () => {
      const app = buildApp()
      const timestamp = Math.floor(Date.now() / 1000)

      const res = await request(app)
        .get('/required')
        .set('Authorization', buildAuthHeader(INVALID_ADDRESS, timestamp))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid address')
    })

    it('allows valid signature', async () => {
      const app = buildApp()
      const timestamp = Math.floor(Date.now() / 1000)

      const res = await request(app)
        .get('/required')
        .set('Authorization', buildAuthHeader(VALID_ADDRESS, timestamp))

      expect(res.status).toBe(200)
      expect(res.body.walletAddress).toBe(VALID_ADDRESS.toLowerCase())
    })

    it('rejects invalid signature', async () => {
      const app = buildApp()
      const timestamp = Math.floor(Date.now() / 1000)
      mocks.verifyMessage.mockResolvedValue(false)

      const res = await request(app)
        .get('/required')
        .set('Authorization', buildAuthHeader(VALID_ADDRESS, timestamp))

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid signature')
    })
  })
})
